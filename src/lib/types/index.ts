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

/**
 * A virtual slice of an Episode on the timeline.
 * Source files are NEVER mutated — all edits are virtual.
 * `deleted: true` = soft-delete (preserves undo/redo integrity).
 */
export interface EpisodeSegment {
  id: string;
  episode_id: string;
  source_start_ms: number;    // Position in the original video file
  source_end_ms: number;      // Position in the original video file
  timeline_offset_ms: number; // Computed global position on the timeline (derived, read-only)
  deleted: boolean;           // Soft-delete flag — never removes from array
}

/** @deprecated Use EpisodeSegment. Kept for backward compatibility during migration. */
export type TimelineClip = EpisodeSegment;
