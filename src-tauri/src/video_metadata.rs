use serde::{Deserialize, Serialize};
use crate::subtitle_info::SubtitleTrack;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoMetadata {
    pub id: String,
    pub filename: String,
    pub path: String,
    pub duration_ms: u64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub video_codec: String,
    pub audio_codec: String,
    pub audio_bitrate_kbps: u32,
    pub file_size_bytes: u64,
    pub subtitle_tracks: Vec<SubtitleTrack>,
}
