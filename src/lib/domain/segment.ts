export interface EpisodeSegment {
  id: string;
  episode_id: string;
  source_start_ms: number;
  source_end_ms: number;
  timeline_offset_ms: number;
  deleted: boolean;
}

export type TimelineClip = EpisodeSegment;
