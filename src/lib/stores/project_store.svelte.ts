import type { VideoMetadata, EpisodeSegment } from "../domain";
import type { RemoveEpisodeResult } from "../services/episode_service";
import { episodeStore } from "./episode_store.svelte";
import { segmentStore } from "./segment_store.svelte";
import { historyStore } from "./history_store.svelte";
import { processingStore } from "./processing_store.svelte";
import { subtitleStore } from "./subtitle_store.svelte";

class ProjectStore {
  // ── Child store references ────────────────────────────────────────────────

  episodeStore = episodeStore;
  segmentStore = segmentStore;
  historyStore = historyStore;
  processingStore = processingStore;
  subtitleStore = subtitleStore;

  get episodes() { return this.episodeStore.episodes; }
  set episodes(v) { this.episodeStore.episodes = v; }

  get segments() { return this.segmentStore.segments; }
  set segments(v) { this.segmentStore.segments = v; }

  get selectedEpisodeId() { return this.episodeStore.selectedEpisodeId; }
  set selectedEpisodeId(v) { this.episodeStore.selectedEpisodeId = v; }

  get selectedSegmentId() { return this.segmentStore.selectedSegmentId; }
  set selectedSegmentId(v) { this.segmentStore.selectedSegmentId = v; }

  get segmentsByEpisode(): Map<string, EpisodeSegment[]> {
    return this.segmentStore.segmentsByEpisode;
  }

  // ── Cross-store orchestration ─────────────────────────────────────────────

  addEpisodes(files: VideoMetadata[]) {
    const result = this.episodeStore.addEpisodes(files, this.segmentStore.segments);
    this.episodeStore.applyAddEpisodesResult(result);
    this.segmentStore.segments = result.segments;
    this.segmentStore.selectedSegmentId = result.newSelectedSegmentId;
    this.segmentStore.recalculateOffsets();
  }

  async removeEpisode(episodeId: string) {
    this.processingStore.processingLabel = "Removing Episode...";
    this.processingStore.isProcessing = true;
    this.processingStore.processingDetails = null;
    await new Promise(resolve => setTimeout(resolve, 30));

    try {
      historyStore.saveFullSnapshot(
        this.episodeStore.episodes, this.segmentStore.segments,
        this.episodeStore.selectedEpisodeId, this.segmentStore.selectedSegmentId,
        this.subtitleStore.selectedSubtitleTracks,
      );
      const result = this.episodeStore.removeEpisode(
        episodeId, this.segmentStore.segments,
        this.segmentStore.selectedSegmentId, this.subtitleStore.selectedSubtitleTracks,
      );
      if (!result) return;
      this.applyRemoveResult(result);
    } finally {
      this.processingStore.isProcessing = false;
      this.processingStore.processingLabel = "";
      this.processingStore.processingDetails = null;
    }
  }

  private applyRemoveResult(result: RemoveEpisodeResult) {
    this.episodeStore.applyRemoveEpisodeResult(result);
    this.segmentStore.segments = result.segments;
    this.subtitleStore.selectedSubtitleTracks = result.selectedSubtitleTracks;
    this.segmentStore.selectedSegmentId = result.newSelectedSegmentId;
    this.segmentStore.recalculateOffsets();
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  clear() {
    this.episodeStore.clear();
    this.segmentStore.clear();
    this.historyStore.clear();
    this.processingStore.clear();
    this.subtitleStore.clear();
  }
}

export const projectStore = new ProjectStore();
