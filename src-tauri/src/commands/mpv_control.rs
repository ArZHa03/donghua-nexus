use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{AppHandle, State};
use crate::mpv_ipc_client;

pub struct MpvState {
    pub client: Arc<Mutex<Option<mpv_ipc_client::MpvIpcClient>>>,
    pub event_listener: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
    pub app_handle: Arc<Mutex<Option<AppHandle>>>,
    pub listener_counter: Arc<AtomicU64>,
}

impl MpvState {
    pub fn new() -> Self {
        Self {
            client: Arc::new(Mutex::new(None)),
            event_listener: Arc::new(Mutex::new(None)),
            app_handle: Arc::new(Mutex::new(None)),
            listener_counter: Arc::new(AtomicU64::new(0)),
        }
    }

    /// Store the AppHandle so we can spawn the event listener later.
    pub fn set_app_handle(&self, handle: AppHandle) {
        *self.app_handle.blocking_lock() = Some(handle);
    }

    /// Abort the current event listener task (if any).
    async fn abort_listener(&self) {
        let mut listener = self.event_listener.lock().await;
        if let Some(handle) = listener.take() {
            eprintln!("[LIFECYCLE] aborting event listener task");
            handle.abort();
            eprintln!("[LIFECYCLE] event listener aborted");
        } else {
            eprintln!("[LIFECYCLE] abort_listener: no active listener to abort");
        }
    }
}

#[tauri::command]
pub async fn mpv_start(state: State<'_, MpvState>) -> Result<(), String> {
    let mut client_opt = state.client.lock().await;
    let mut is_broken = true;
    let mut old_pid: Option<u32> = None;

    if let Some(client) = client_opt.as_ref() {
        if client.can_write().await {
            is_broken = false;
        }
        old_pid = client.pid;
    }

    if client_opt.is_some() && !is_broken {
        eprintln!("[LIFECYCLE] mpv_start: reusing existing client (PID={:?})", old_pid);
        return Ok(());
    }

    eprintln!("======================");
    eprintln!("[LIFECYCLE] mpv_start: starting/reconnecting");
    eprintln!("[LIFECYCLE]   old client broken? {}", is_broken);
    eprintln!("[LIFECYCLE]   old PID={:?}", old_pid);

    // Abort any previous event listener
    state.abort_listener().await;

    // Connect command pipe
    let client = mpv_ipc_client::MpvIpcClient::start_and_connect().await?;
    let new_pid = client.pid;
    eprintln!("[LIFECYCLE]   new PID={:?}", new_pid);

    // Log MPV version
    match client.get_mpv_version().await {
        Ok(ver) => eprintln!("[LIFECYCLE] MPV Version: {}", ver),
        Err(e) => eprintln!("[LIFECYCLE] MPV Version: unknown (error: {})", e),
    }

    // Open a second pipe for event listening
    let event_pipe = mpv_ipc_client::MpvIpcClient::open_event_pipe().await?;
    eprintln!("[LIFECYCLE]   event pipe opened");

    // Spawn the event listener
    let app_handle = state.app_handle.lock().await.clone();
    if let Some(handle) = app_handle {
        let listener_id = state.listener_counter.fetch_add(1, Ordering::SeqCst);
        eprintln!("[LIFECYCLE]   spawning listener#{}", listener_id);
        let listener = mpv_ipc_client::spawn_event_listener(event_pipe, handle, listener_id);
        *state.event_listener.lock().await = Some(listener);
        eprintln!("[LIFECYCLE]   listener#{} spawned, old_pid={:?}, new_pid={:?}", listener_id, old_pid, new_pid);
    } else {
        eprintln!("[LIFECYCLE]   WARNING: no app_handle available, listener NOT spawned");
    }

    *client_opt = Some(client);
    eprintln!("[LIFECYCLE] mpv_start: done");
    eprintln!("======================");
    Ok(())
}

#[tauri::command]
pub async fn mpv_load_file(
    path: String,
    start_sec: f64,
    state: State<'_, MpvState>,
) -> Result<(), String> {
    eprintln!("--- mpv_load_file called: path={}, start_sec={}", path, start_sec);

    let mut client_opt = state.client.lock().await;
    if let Some(client) = client_opt.as_mut() {
        match client.load_file(&path, start_sec).await {
            Ok(()) => {
                if let Err(e) = client.enable_observations().await {
                    eprintln!("[LIFECYCLE] mpv_load_file: enable_observations failed: {}", e);
                    state.abort_listener().await;
                    *client_opt = None;
                    return Err(e);
                }
                Ok(())
            }
            Err(e) => {
                eprintln!("[LIFECYCLE] mpv_load_file: load_file failed: {}", e);
                state.abort_listener().await;
                *client_opt = None;
                Err(e)
            }
        }
    } else {
        Err("MPV client not started".into())
    }
}

#[tauri::command]
pub async fn mpv_seek(time_sec: f64, state: State<'_, MpvState>) -> Result<(), String> {
    let mut client_opt = state.client.lock().await;
    if let Some(client) = client_opt.as_mut() {
        match client.seek(time_sec).await {
            Ok(()) => Ok(()),
            Err(e) => {
                eprintln!("[LIFECYCLE] mpv_seek failed: {}", e);
                state.abort_listener().await;
                *client_opt = None;
                Err(e)
            }
        }
    } else {
        Err("MPV client not started".into())
    }
}

#[tauri::command]
pub async fn mpv_toggle_pause(state: State<'_, MpvState>) -> Result<(), String> {
    let mut client_opt = state.client.lock().await;
    if let Some(client) = client_opt.as_mut() {
        match client.toggle_pause().await {
            Ok(()) => Ok(()),
            Err(e) => {
                eprintln!("[LIFECYCLE] mpv_toggle_pause failed: {}", e);
                state.abort_listener().await;
                *client_opt = None;
                Err(e)
            }
        }
    } else {
        Err("MPV client not started".into())
    }
}

#[tauri::command]
pub async fn mpv_frame_step(
    direction: String,
    state: State<'_, MpvState>,
) -> Result<(), String> {
    let mut client_opt = state.client.lock().await;
    if let Some(client) = client_opt.as_mut() {
        let res = if direction == "forward" {
            client.frame_step().await
        } else {
            client.frame_back_step().await
        };
        match res {
            Ok(()) => Ok(()),
            Err(e) => {
                eprintln!("[LIFECYCLE] mpv_frame_step failed: {}", e);
                state.abort_listener().await;
                *client_opt = None;
                Err(e)
            }
        }
    } else {
        Err("MPV client not started".into())
    }
}

#[tauri::command]
pub async fn mpv_unload(state: State<'_, MpvState>) -> Result<(), String> {
    // Abort the event listener
    state.abort_listener().await;

    let mut client_opt = state.client.lock().await;
    if let Some(client) = client_opt.as_mut() {
        client.unload().await.map_err(|e| {
            eprintln!("[LIFECYCLE] mpv_unload: stop command failed: {}", e);
            *client_opt = None;
            e
        })
    } else {
        Ok(())
    }
}
