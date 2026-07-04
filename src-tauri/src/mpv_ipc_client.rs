use std::process::{Command, Stdio};
use tokio::io::AsyncWriteExt;
use tokio::net::windows::named_pipe::{ClientOptions, NamedPipeClient};
use tokio::time::{sleep, Duration};
use crate::third_party_paths::MPV_PATH;

pub struct MpvIpcClient {
    pipe: NamedPipeClient,
}

impl MpvIpcClient {
    pub async fn start_and_connect() -> Result<Self, String> {
        let pipe_name = r"\\.\pipe\donghua-nexus-mpv";
        
        // Try connecting to named pipe first to see if an instance is already running
        if let Ok(client) = ClientOptions::new().open(pipe_name) {
            return Ok(Self { pipe: client });
        }

        // Spawn MPV if not already running
        Command::new(MPV_PATH)
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
            .map_err(|e| format!("Failed to spawn MPV: {}", e))?;

        // Try connecting to named pipe
        for _ in 0..10 {
            sleep(Duration::from_millis(200)).await;
            if let Ok(client) = ClientOptions::new().open(pipe_name) {
                return Ok(Self { pipe: client });
            }
        }

        Err("Failed to connect to MPV IPC pipe after retries".into())
    }

    pub async fn send_command(&mut self, command: serde_json::Value) -> Result<(), String> {
        let mut msg = serde_json::to_string(&command).unwrap();
        msg.push('\n');
        
        let ready = self.pipe.ready(tokio::io::Interest::WRITABLE).await
            .map_err(|e| format!("Pipe completely closed? {}", e))?;

        if ready.is_writable() {
            match self.pipe.write_all(msg.as_bytes()).await {
                Ok(_) => Ok(()),
                Err(e) => Err(format!("Failed to write to pipe: {}", e))
            }
        } else {
            Err("Pipe not ready".into())
        }
    }

    pub async fn load_file(&mut self, path: &str, start_sec: f64) -> Result<(), String> {
        // Build option string: "start=100.3,pause=yes"
        let options = format!("start={:.3},pause=yes", start_sec);
        let load_cmd = serde_json::json!({
            "command": ["loadfile", path, "replace", "0", options]
        });
        self.send_command(load_cmd).await?;
        Ok(())
    }

    pub async fn seek(&mut self, seconds: f64) -> Result<(), String> {
        let cmd = serde_json::json!({
            "command": ["seek", seconds, "absolute", "exact"]
        });
        self.send_command(cmd).await
    }

    pub async fn toggle_pause(&mut self) -> Result<(), String> {
        let cmd = serde_json::json!({
            "command": ["cycle", "pause"]
        });
        self.send_command(cmd).await
    }

    pub async fn frame_step(&mut self) -> Result<(), String> {
        let cmd = serde_json::json!({
            "command": ["frame-step"]
        });
        self.send_command(cmd).await
    }

    pub async fn frame_back_step(&mut self) -> Result<(), String> {
        let cmd = serde_json::json!({
            "command": ["frame-back-step"]
        });
        self.send_command(cmd).await
    }

    pub async fn stop(&mut self) -> Result<(), String> {
        let cmd = serde_json::json!({
            "command": ["quit"]
        });
        self.send_command(cmd).await
    }
}
