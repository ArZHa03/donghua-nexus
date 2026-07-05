export interface SubtitleTrack {
  stream_index: number | null;
  language: string;
  title: string;
  codec: string;
  is_external: boolean;
  external_path: string | null;
}

export interface VideoMetadata {
  id: string;
  filename: string;
  path: string;
  duration_ms: number;
  width: number;
  height: number;
  fps: number;
  video_codec: string;
  audio_codec: string;
  audio_bitrate_kbps: number;
  file_size_bytes: number;
  subtitle_tracks: SubtitleTrack[];
}
