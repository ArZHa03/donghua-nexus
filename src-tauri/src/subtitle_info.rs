use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtitleTrack {
    pub stream_index: Option<usize>,
    pub language: String,
    pub title: String,
    pub codec: String,
    pub is_external: bool,
    pub external_path: Option<String>,
}
