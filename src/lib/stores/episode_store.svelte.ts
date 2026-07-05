import type { VideoMetadata, EpisodeSegment } from "../domain";
import { EpisodeService, type AddEpisodesResult, type RemoveEpisodeResult } from "../services/episode_service";

class EpisodeStore {
  episodes = $state<VideoMetadata[]>([]);
  selectedEpisodeId = $state<string | null>(null);

  private episodeService = new EpisodeService();

  get selectedEpisode(): VideoMetadata | null {
    return this.episodes.find(e => e.id === this.selectedEpisodeId) ?? null;
  }

  get total_file_size_bytes(): number {
    return this.episodes.reduce((sum, e) => sum + e.file_size_bytes, 0);
  }

  addEpisodes(files: VideoMetadata[], currentSegments: EpisodeSegment[]): AddEpisodesResult {
    return this.episodeService.addEpisodes(
      this.episodes, currentSegments, files, this.selectedEpisodeId,
    );
  }

  applyAddEpisodesResult(result: AddEpisodesResult) {
    this.episodes = result.episodes;
    this.selectedEpisodeId = result.newSelectedEpisodeId;
  }

  removeEpisode(
    episodeId: string,
    currentSegments: EpisodeSegment[],
    selectedSegmentId: string | null,
    selectedSubtitleTracks: Record<string, number | null>,
  ): RemoveEpisodeResult | null {
    if (!this.episodes.some(e => e.id === episodeId)) return null;

    return this.episodeService.removeEpisode(
      this.episodes, currentSegments, episodeId,
      this.selectedEpisodeId, selectedSegmentId, selectedSubtitleTracks,
    );
  }

  applyRemoveEpisodeResult(result: RemoveEpisodeResult) {
    this.episodes = result.episodes;
    this.selectedEpisodeId = result.newSelectedEpisodeId;
  }

  clear() {
    this.episodes = [];
    this.selectedEpisodeId = null;
  }
}

export const episodeStore = new EpisodeStore();
