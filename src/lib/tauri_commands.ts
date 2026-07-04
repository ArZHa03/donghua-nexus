import { invoke } from "@tauri-apps/api/core";
import type { VideoMetadata } from "./types";

export const tauriCommands = {
  importVideos: (paths: string[]): Promise<VideoMetadata[]> => {
    return invoke("import_videos", { paths });
  },

  importFolder: (path: string): Promise<VideoMetadata[]> => {
    return invoke("import_folder", { path });
  },
  
  mpvStart: (): Promise<void> => {
    return invoke("mpv_start");
  },
  
  mpvLoadFile: (path: string, startSec: number): Promise<void> => {
    return invoke("mpv_load_file", { path, startSec });
  },
  
  mpvSeek: (timeSec: number): Promise<void> => {
    return invoke("mpv_seek", { timeSec });
  },
  
  mpvTogglePause: (): Promise<void> => {
    return invoke("mpv_toggle_pause");
  },
  
  mpvFrameStep: (direction: "forward" | "backward"): Promise<void> => {
    return invoke("mpv_frame_step", { direction });
  },

  updateMpvBounds: (x: number, y: number, width: number, height: number): Promise<void> => {
    return invoke("update_mpv_bounds", { x, y, width, height });
  }
};
