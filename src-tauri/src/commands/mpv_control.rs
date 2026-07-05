use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{AppHandle, State};
use crate::mpv_ipc_client;

pub struct MpvState {
    pub client: Arc<Mutex<Option<mpv_ipc_client::MpvIpcClient>>>,
    pub event_listener: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
    pub app_handle: Arc<Mutex<Option<AppHandle>>>,
}

impl MpvState {
    pub fn new() -> Self {
        Self {
            client: Arc::new(Mutex::new(None)),
            event_listener: Arc::new(Mutex::new(None)),
            app_handle: Arc::new(Mutex::new(None)),
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
            handle.abort();
        }
    }
}

#[tauri::command]
pub async fn mpv_start(state: State<'_, MpvState>) -> Result<(), String> {
    let mut client_opt = state.client.lock().await;
    let mut is_broken = true;

    if let Some(client) = client_opt.as_ref() {
        if client.can_write().await {
            is_broken = false;
        }
    }

    if client_opt.is_none() || is_broken {
        // Abort any previous event listener
        state.abort_listener().await;

        // Connect command pipe
        let client = mpv_ipc_client::MpvIpcClient::start_and_connect().await?;

        // Open a second pipe for event listening
        let event_pipe = mpv_ipc_client::MpvIpcClient::open_event_pipe().await?;

        // Spawn the event listener
        let app_handle = state.app_handle.lock().await.clone();
        if let Some(handle) = app_handle {
            let listener = mpv_ipc_client::spawn_event_listener(event_pipe, handle);
            *state.event_listener.lock().await = Some(listener);
        }

        *client_opt = Some(client);
    }
    Ok(())
}

#[tauri::command]
pub async fn mpv_load_file(
    path: String,
    start_sec: f64,
    state: State<'_, MpvState>,
) -> Result<(), String> {
    let mut client_opt = state.client.lock().await;
    if let Some(client) = client_opt.as_mut() {
        client.load_file(&path, start_sec).await?;
        // Enable property observations so MPV sends playback-time / pause events
        client.enable_observations().await?;
        Ok(())
    } else {
        Err("MPV client not started".into())
    }
}

#[tauri::command]
pub async fn mpv_seek(time_sec: f64, state: State<'_, MpvState>) -> Result<(), String> {
    let mut client_opt = state.client.lock().await;
    if let Some(client) = client_opt.as_mut() {
        client.seek(time_sec).await.map_err(|e| {
            *client_opt = None;
            e
        })
    } else {
        Err("MPV client not started".into())
    }
}

#[tauri::command]
pub async fn mpv_toggle_pause(state: State<'_, MpvState>) -> Result<(), String> {
    let mut client_opt = state.client.lock().await;
    if let Some(client) = client_opt.as_mut() {
        client.toggle_pause().await.map_err(|e| {
            *client_opt = None;
            e
        })
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
        res.map_err(|e| {
            *client_opt = None;
            e
        })
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
            *client_opt = None;
            e
        })
    } else {
        Ok(())
    }
}
