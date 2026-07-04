use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::State;
use crate::mpv_ipc_client::MpvIpcClient;

pub struct MpvState {
    pub client: Arc<Mutex<Option<MpvIpcClient>>>,
}

#[tauri::command]
pub async fn mpv_start(state: State<'_, MpvState>) -> Result<(), String> {
    let mut client_opt = state.client.lock().await;
    let mut is_broken = true;

    if let Some(client) = client_opt.as_ref() {
        // Check if the named pipe client is still writable and connected
        if client.can_write().await {
            is_broken = false;
        }
    }

    if client_opt.is_none() || is_broken {
        let client = MpvIpcClient::start_and_connect().await?;
        *client_opt = Some(client);
    }
    Ok(())
}

#[tauri::command]
pub async fn mpv_load_file(path: String, start_sec: f64, state: State<'_, MpvState>) -> Result<(), String> {
    let mut client_opt = state.client.lock().await;
    if let Some(client) = client_opt.as_mut() {
        if let Err(e) = client.load_file(&path, start_sec).await {
            *client_opt = None; // Reset client on error to allow reconnects
            return Err(e);
        }
    } else {
        return Err("MPV client not started".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn mpv_seek(time_sec: f64, state: State<'_, MpvState>) -> Result<(), String> {
    let mut client_opt = state.client.lock().await;
    if let Some(client) = client_opt.as_mut() {
        if let Err(e) = client.seek(time_sec).await {
            *client_opt = None; // Reset client on error
            return Err(e);
        }
    } else {
        return Err("MPV client not started".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn mpv_toggle_pause(state: State<'_, MpvState>) -> Result<(), String> {
    let mut client_opt = state.client.lock().await;
    if let Some(client) = client_opt.as_mut() {
        if let Err(e) = client.toggle_pause().await {
            *client_opt = None; // Reset client on error
            return Err(e);
        }
    } else {
        return Err("MPV client not started".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn mpv_frame_step(direction: String, state: State<'_, MpvState>) -> Result<(), String> {
    let mut client_opt = state.client.lock().await;
    if let Some(client) = client_opt.as_mut() {
        let res = if direction == "forward" {
            client.frame_step().await
        } else {
            client.frame_back_step().await
        };
        if let Err(e) = res {
            *client_opt = None; // Reset client on error
            return Err(e);
        }
    } else {
        return Err("MPV client not started".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn mpv_unload(state: State<'_, MpvState>) -> Result<(), String> {
    let mut client_opt = state.client.lock().await;
    if let Some(client) = client_opt.as_mut() {
        if let Err(e) = client.unload().await {
            *client_opt = None;
            return Err(e);
        }
    }
    // If MPV is not running, treat as no-op (project already cleared)
    Ok(())
}
