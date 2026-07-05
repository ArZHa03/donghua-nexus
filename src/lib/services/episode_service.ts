import type { VideoMetadata, EpisodeSegment } from "../domain";

export interface AddEpisodesResult {
  episodes: VideoMetadata[];
  segments: EpisodeSegment[];
  newSelectedEpisodeId: string | null;
  newSelectedSegmentId: string | null;
}

export interface RemoveEpisodeResult {
  episodes: VideoMetadata[];
  segments: EpisodeSegment[];
  selectedSubtitleTracks: Record<string, number | null>;
  newSelectedEpisodeId: string | null;
  newSelectedSegmentId: string | null;
}

export class EpisodeService {
  addEpisodes(
    episodes: VideoMetadata[],
    segments: EpisodeSegment[],
    files: VideoMetadata[],
    currentSelectedEpisodeId: string | null,
  ): AddEpisodesResult {
    const newEpisodes = [...episodes];
    const newSegments = [...segments];

    for (const file of files) {
      if (!newEpisodes.some(e => e.path === file.path)) {
        newEpisodes.push(file);
        newSegments.push({
          id: crypto.randomUUID(),
          episode_id: file.id,
          source_start_ms: 0,
          source_end_ms: file.duration_ms,
          timeline_offset_ms: 0,
          deleted: false,
        });
      }
    }

    let newSelectedEpisodeId = currentSelectedEpisodeId;
    let newSelectedSegmentId: string | null = null;

    if (!newSelectedEpisodeId && newEpisodes.length > 0) {
      const firstEp = newEpisodes[0];
      newSelectedEpisodeId = firstEp.id;
      const firstSeg = newSegments.find(s => s.episode_id === firstEp.id && !s.deleted);
      newSelectedSegmentId = firstSeg?.id ?? null;
    }

    return {
      episodes: newEpisodes,
      segments: newSegments,
      newSelectedEpisodeId,
      newSelectedSegmentId,
    };
  }

  removeEpisode(
    episodes: VideoMetadata[],
    segments: EpisodeSegment[],
    episodeId: string,
    selectedEpisodeId: string | null,
    selectedSegmentId: string | null,
    selectedSubtitleTracks: Record<string, number | null>,
  ): RemoveEpisodeResult {
    const filteredEps = episodes.filter(e => e.id !== episodeId);
    const filteredSegs = segments.filter(s => s.episode_id !== episodeId);

    const cleanTracks = { ...selectedSubtitleTracks };
    delete cleanTracks[episodeId];

    let newSelectedEpisodeId = selectedEpisodeId;
    let newSelectedSegmentId = selectedSegmentId;

    if (selectedEpisodeId === episodeId) {
      const firstEp = filteredEps[0]?.id ?? null;
      newSelectedEpisodeId = firstEp;
      newSelectedSegmentId = firstEp
        ? (filteredSegs.find(s => s.episode_id === firstEp && !s.deleted)?.id ?? null)
        : null;
    }

    return {
      episodes: filteredEps,
      segments: filteredSegs,
      selectedSubtitleTracks: cleanTracks,
      newSelectedEpisodeId,
      newSelectedSegmentId,
    };
  }
}
