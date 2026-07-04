use crate::video_metadata::VideoMetadata;
use crate::ffprobe_runner::probe_file;
use crate::natural_sort::natural_sort;

#[tauri::command]
pub async fn import_videos(mut paths: Vec<String>) -> Result<Vec<VideoMetadata>, String> {
    // Filter unsupported files
    paths.retain(|p| p.to_lowercase().ends_with(".mkv") || p.to_lowercase().ends_with(".mp4"));
    
    // Sort logically before processing
    natural_sort(&mut paths);

    process_video_paths(paths).await
}

#[tauri::command]
pub async fn import_folder(path: String) -> Result<Vec<VideoMetadata>, String> {
    let mut paths = Vec::new();
    scan_dir_recursive(std::path::Path::new(&path), &mut paths, 0);
    
    // Sort logically
    natural_sort(&mut paths);

    process_video_paths(paths).await
}

fn scan_dir_recursive(dir: &std::path::Path, paths: &mut Vec<String>, depth: usize) {
    if depth > 10 { return; }
    
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                scan_dir_recursive(&path, paths, depth + 1);
            } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                let ext_lower = ext.to_lowercase();
                if ext_lower == "mkv" || ext_lower == "mp4" {
                    if let Some(path_str) = path.to_str() {
                        paths.push(path_str.to_string());
                    }
                }
            }
        }
    }
}

async fn process_video_paths(paths: Vec<String>) -> Result<Vec<VideoMetadata>, String> {
    let mut tasks = Vec::new();

    for path in paths {
        tasks.push(tokio::spawn(async move {
            probe_file(&path).await
        }));
    }

    let mut metadata_list = Vec::new();
    for task in tasks {
        if let Ok(Some(metadata)) = task.await {
            metadata_list.push(metadata);
        }
    }

    Ok(metadata_list)
}
