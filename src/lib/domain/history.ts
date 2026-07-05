import type { VideoMetadata } from "./episode";
import type { EpisodeSegment } from "./segment";

export interface HistorySnapshot {
  episodes: VideoMetadata[];
  segments: EpisodeSegment[];
  selectedEpisodeId: string | null;
  selectedSegmentId: string | null;
  selectedSubtitleTracks: Record<string, number | null>;
}
