use tokio::process::Command;
use serde::Deserialize;
use uuid::Uuid;

use crate::third_party_paths::FFPROBE_PATH;
use crate::video_metadata::VideoMetadata;
use crate::subtitle_info::SubtitleTrack;

#[derive(Deserialize)]
struct FfprobeOutput {
    streams: Vec<FfprobeStream>,
    format: FfprobeFormat,
}

#[derive(Deserialize)]
struct FfprobeStream {
    index: usize,
    codec_type: String,
    codec_name: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    r_frame_rate: Option<String>,
    bit_rate: Option<String>,
    tags: Option<std::collections::HashMap<String, String>>,
}

#[derive(Deserialize)]
struct FfprobeFormat {
    duration: Option<String>,
    size: Option<String>,
}

pub async fn probe_file(path: &str) -> Option<VideoMetadata> {
    let output = Command::new(FFPROBE_PATH)
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            path,
        ])
        .output()
        .await
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let parsed: FfprobeOutput = serde_json::from_slice(&output.stdout).ok()?;

    let mut video_codec = String::from("unknown");
    let mut audio_codec = String::from("unknown");
    let mut width = 0;
    let mut height = 0;
    let mut fps = 0.0;
    let mut audio_bitrate_kbps = 128; // Default fallback
    let mut subtitle_tracks = Vec::new();

    for stream in parsed.streams {
        match stream.codec_type.as_str() {
            "video" => {
                if width == 0 {
                    width = stream.width.unwrap_or(0);
                    height = stream.height.unwrap_or(0);
                    video_codec = stream.codec_name.unwrap_or_else(|| "unknown".into());
                    
                    if let Some(r) = stream.r_frame_rate {
                        let parts: Vec<&str> = r.split('/').collect();
                        if parts.len() == 2 {
                            let num: f64 = parts[0].parse().unwrap_or(0.0);
                            let den: f64 = parts[1].parse().unwrap_or(1.0);
                            if den > 0.0 {
                                fps = num / den;
                            }
                        }
                    }
                }
            }
            "audio" => {
                if audio_codec == "unknown" {
                    audio_codec = stream.codec_name.clone().unwrap_or_else(|| "unknown".into());
                    if let Some(br_str) = stream.bit_rate {
                        if let Ok(br) = br_str.parse::<u32>() {
                            audio_bitrate_kbps = br / 1000;
                        }
                    }
                }
            }
            "subtitle" => {
                let language = stream
                    .tags
                    .as_ref()
                    .and_then(|t| t.get("language"))
                    .map(|s| s.clone())
                    .unwrap_or_else(|| "unknown".into());
                
                let title = stream
                    .tags
                    .as_ref()
                    .and_then(|t| t.get("title"))
                    .map(|s| s.clone())
                    .unwrap_or_else(|| language.clone());

                subtitle_tracks.push(SubtitleTrack {
                    stream_index: Some(stream.index),
                    language,
                    title,
                    codec: stream.codec_name.unwrap_or_else(|| "unknown".into()),
                    is_external: false,
                    external_path: None,
                });
            }
            _ => {}
        }
    }

    let duration_sec: f64 = parsed.format.duration.and_then(|s| s.parse().ok()).unwrap_or(0.0);
    let duration_ms = (duration_sec * 1000.0) as u64;
    let file_size_bytes: u64 = parsed.format.size.and_then(|s| s.parse().ok()).unwrap_or(0);

    let path_obj = std::path::Path::new(path);
    let filename = path_obj.file_name().unwrap_or_default().to_string_lossy().into_owned();

    Some(VideoMetadata {
        id: Uuid::new_v4().to_string(),
        filename,
        path: path.to_string(),
        duration_ms,
        width,
        height,
        fps,
        video_codec,
        audio_codec,
        audio_bitrate_kbps,
        file_size_bytes,
        subtitle_tracks,
    })
}
