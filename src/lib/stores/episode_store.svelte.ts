import type { VideoMetadata } from "../domain";

class EpisodeStore {
  episodes = $state<VideoMetadata[]>([]);
  selectedEpisodeId = $state<string | null>(null);

  get selectedEpisode(): VideoMetadata | null {
    return this.episodes.find(e => e.id === this.selectedEpisodeId) ?? null;
  }

  get total_file_size_bytes(): number {
    return this.episodes.reduce((sum, e) => sum + e.file_size_bytes, 0);
  }

  clear() {
    this.episodes = [];
    this.selectedEpisodeId = null;
  }
}

export const episodeStore = new EpisodeStore();
