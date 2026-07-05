import type { VideoMetadata } from "../domain";

class SubtitleStore {
  selectedSubtitleTracks = $state<Record<string, number | null>>({});

  setEpisodeSubtitleTrack(episodeId: string, trackIndex: number | null) {
    this.selectedSubtitleTracks[episodeId] = trackIndex;
  }

  getEpisodeSubtitleTrack(episodeId: string, episodes: VideoMetadata[]): number | null {
    if (this.selectedSubtitleTracks[episodeId] === undefined) {
      const ep = episodes.find(e => e.id === episodeId);
      return (ep && ep.subtitle_tracks.length > 0) ? 0 : null;
    }
    return this.selectedSubtitleTracks[episodeId];
  }

  clear() {
    this.selectedSubtitleTracks = {};
  }
}

export const subtitleStore = new SubtitleStore();
