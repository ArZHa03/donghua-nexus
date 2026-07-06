use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::windows::named_pipe::{ClientOptions, NamedPipeClient};
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};
use tauri::Emitter;
use crate::third_party_paths::MPV_PATH;

pub struct MpvIpcClient {
    pipe: Arc<Mutex<NamedPipeClient>>,
    pub pid: Option<u32>,
    pub hwnd: Option<isize>,
    request_id: AtomicU64,
}

impl MpvIpcClient {
    pub async fn start_and_connect() -> Result<Self, String> {
        let pipe_name = r"\\.\pipe\donghua-nexus-mpv";

        // Try to connect to existing MPV instance
        if let Ok(pipe) = ClientOptions::new().open(pipe_name) {
            eprintln!("[LIFECYCLE] start_and_connect: connected to existing MPV via {}", pipe_name);
            return Ok(Self {
                pipe: Arc::new(Mutex::new(pipe)),
                pid: None,
                hwnd: None,
                request_id: AtomicU64::new(1),
            });
        }

        eprintln!("[LIFECYCLE] start_and_connect: spawning new MPV process");
        eprintln!("[LIFECYCLE]   path={:?}", MPV_PATH);
        eprintln!("[LIFECYCLE]   ipc={}", pipe_name);

        let child = Command::new(MPV_PATH)
            .args([
                "--idle",
                "--no-terminal",
                &format!("--input-ipc-server={}", pipe_name),
                "--keep-open=yes",
                "--osc=no",
                "--osd-level=1",
                "--force-window=yes",
                "--geometry=50%x50%",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| {
                eprintln!("[LIFECYCLE]   spawn failed: {}", e);
                format!("Failed to spawn MPV: {}", e)
            })?;

        let pid = child.id();
        eprintln!("[LIFECYCLE]   spawned PID={}", pid);

        for i in 0..10 {
            sleep(Duration::from_millis(200)).await;
            if let Ok(pipe) = ClientOptions::new().open(pipe_name) {
                eprintln!("[LIFECYCLE]   connected after {} retries, PID={}", i + 1, pid);
                return Ok(Self {
                    pipe: Arc::new(Mutex::new(pipe)),
                    pid: Some(pid),
                    hwnd: None,
                    request_id: AtomicU64::new(1),
                });
            }
        }

        eprintln!("[LIFECYCLE]   failed to connect after 10 retries");
        Err("Failed to connect to MPV IPC pipe after retries".into())
    }

    /// Open a second named-pipe connection to MPV for the event listener.
    pub async fn open_event_pipe() -> Result<NamedPipeClient, String> {
        let pipe_name = r"\\.\pipe\donghua-nexus-mpv";
        for i in 0..5 {
            if let Ok(client) = ClientOptions::new().open(pipe_name) {
                eprintln!("[LIFECYCLE] open_event_pipe: connected (attempt {})", i + 1);
                return Ok(client);
            }
            sleep(Duration::from_millis(100)).await;
        }
        eprintln!("[LIFECYCLE] open_event_pipe: FAILED after 5 attempts");
        Err("Failed to open event pipe to MPV".into())
    }

    // ── Low-level: send command with request_id and read its response ────

    async fn send_with_response(&self, cmd: serde_json::Value) -> Result<serde_json::Value, String> {
        let req_id = self.request_id.fetch_add(1, Ordering::SeqCst) as i64;
        let mut cmd = cmd;
        cmd["request_id"] = serde_json::json!(req_id);

        let mut msg = serde_json::to_string(&cmd).unwrap();
        msg.push('\n');

        let mut pipe = self.pipe.lock().await;
        pipe.write_all(msg.as_bytes())
            .await
            .map_err(|e| format!("Write to MPV pipe failed: {}", e))?;

        loop {
            let line = read_pipe_line(&mut *pipe).await?;
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&line) {
                if parsed.get("request_id").and_then(|v| v.as_i64()) == Some(req_id) {
                    if let Some(err) = parsed.get("error").and_then(|v| v.as_str()) {
                        if err != "success" {
                            return Err(err.to_string());
                        }
                    }
                    return Ok(parsed);
                }
                // Non-matching lines (events interleaved before response)
                // are ignored here; the event listener handles them.
            }
        }
    }

    // ── High-level commands (all wait for MPV response) ──────────────────

    pub async fn load_file(&self, path: &str, start_sec: f64) -> Result<(), String> {
        let options = format!("start={:.3},pause=yes", start_sec);
        let cmd = serde_json::json!({
            "command": ["loadfile", path, "replace", -1, options]
        });

        eprintln!("==============================");
        eprintln!("[MPV LOADFILE]");
        eprintln!("==============================");
        eprintln!("Path: {}", path);
        eprintln!("StartSec: {}", start_sec);
        eprintln!("Command: {}", serde_json::to_string(&cmd).unwrap());

        match self.send_with_response(cmd).await {
            Ok(resp) => {
                let err = resp.get("error").and_then(|v| v.as_str()).unwrap_or("unknown");
                eprintln!("Response: {}", serde_json::to_string(&resp).unwrap());
                eprintln!("Parsed error: {}", err);
                eprintln!("==============================");
                Ok(())
            }
            Err(e) => {
                eprintln!("Raw error: {}", e);
                eprintln!("==============================");
                Err(e)
            }
        }
    }

    pub async fn seek(&self, seconds: f64) -> Result<(), String> {
        let cmd = serde_json::json!({
            "command": ["seek", seconds, "absolute", "exact"]
        });
        self.send_with_response(cmd).await?;
        Ok(())
    }

    pub async fn toggle_pause(&self) -> Result<(), String> {
        let cmd = serde_json::json!({ "command": ["cycle", "pause"] });
        self.send_with_response(cmd).await?;
        Ok(())
    }

    pub async fn frame_step(&self) -> Result<(), String> {
        let cmd = serde_json::json!({ "command": ["frame-step"] });
        self.send_with_response(cmd).await?;
        Ok(())
    }

    pub async fn frame_back_step(&self) -> Result<(), String> {
        let cmd = serde_json::json!({ "command": ["frame-back-step"] });
        self.send_with_response(cmd).await?;
        Ok(())
    }

    pub async fn unload(&self) -> Result<(), String> {
        let cmd = serde_json::json!({ "command": ["stop"] });
        self.send_with_response(cmd).await?;
        Ok(())
    }

    pub async fn quit(&self) -> Result<(), String> {
        let cmd = serde_json::json!({ "command": ["quit"] });
        self.send_with_response(cmd).await?;
        Ok(())
    }

    /// Register a property observation. MPV sends `property-change` events
    /// on this connection when the property value changes.
    pub async fn observe_property(&self, name: &str) -> Result<(), String> {
        let cmd = serde_json::json!({
            "command": ["observe_property", 1, name]
        });
        self.send_with_response(cmd).await?;
        Ok(())
    }

    /// Enable all useful property observations after a file is loaded.
    pub async fn enable_observations(&self) -> Result<(), String> {
        self.observe_property("playback-time").await?;
        self.observe_property("pause").await?;
        self.observe_property("eof-reached").await?;
        self.observe_property("seeking").await?;
        self.observe_property("duration").await
    }

    pub async fn get_mpv_version(&self) -> Result<String, String> {
        let cmd = serde_json::json!({
            "command": ["get_property", "mpv-version"]
        });
        let resp = self.send_with_response(cmd).await?;
        let version = resp
            .get("data")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();
        Ok(version)
    }

    pub async fn can_write(&self) -> bool {
        let pipe = self.pipe.lock().await;
        pipe.ready(tokio::io::Interest::WRITABLE).await.is_ok()
    }
}

// ── Standalone helpers ────────────────────────────────────────────────────

/// Read one newline-terminated line from an MPV named pipe.
async fn read_pipe_line(pipe: &mut NamedPipeClient) -> Result<String, String> {
    let mut buf = Vec::with_capacity(256);
    loop {
        let mut byte = [0u8; 1];
        pipe.read_exact(&mut byte)
            .await
            .map_err(|e| format!("Read from MPV pipe failed: {}", e))?;
        if byte[0] == b'\n' {
            break;
        }
        buf.push(byte[0]);
    }
    String::from_utf8(buf).map_err(|e| format!("Invalid UTF-8 from MPV: {}", e))
}

/// Spawn a background task that continuously reads from a second named-pipe
/// connection to MPV and forwards events to the frontend via Tauri events.
///
/// The second connection receives global MPV events (file-loaded, end-file,
/// seek, etc.). Property-change events arrive on the command connection and
/// are read by `send_with_response` between commands.
pub fn spawn_event_listener(
    mut event_pipe: NamedPipeClient,
    app_handle: tauri::AppHandle,
    listener_id: u64,
) -> tokio::task::JoinHandle<()> {
    eprintln!("[LIFECYCLE] listener#{}: spawning, thread={:?}", listener_id, std::thread::current().id());
    tokio::spawn(async move {
        eprintln!("[LIFECYCLE] listener#{}: running (tokio task started)", listener_id);
        loop {
            match read_pipe_line(&mut event_pipe).await {
                Ok(line) => {
                    if line.trim().is_empty() {
                        continue;
                    }
                    if let Ok(event) = serde_json::from_str::<serde_json::Value>(&line) {
                        // Forward only spontaneous events (no request_id)
                        if event.get("event").is_some() && event.get("request_id").is_none() {
                            let _ = app_handle.emit("mpv-event", &event);
                        }
                    }
                }
                Err(e) => {
                    let err_str = e.to_string();
                    eprintln!("[LIFECYCLE] listener#{}: exit — reason: {}", listener_id, err_str);
                    if err_str.contains("early eof") || err_str.contains("EOF") {
                        eprintln!("[LIFECYCLE] listener#{}: detected EOF (MPV child probably exited)", listener_id);
                    } else if err_str.contains("broken pipe") {
                        eprintln!("[LIFECYCLE] listener#{}: detected broken pipe (MPV child crashed)", listener_id);
                    } else {
                        eprintln!("[LIFECYCLE] listener#{}: IO error", listener_id);
                    }
                    let err_event =
                        serde_json::json!({"event": "listener-error", "error": err_str, "listener_id": listener_id});
                    let _ = app_handle.emit("mpv-event", &err_event);
                    break;
                }
            }
        }
        eprintln!("[LIFECYCLE] listener#{}: task ended", listener_id);
    })
}
