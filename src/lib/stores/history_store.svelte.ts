import type { VideoMetadata, EpisodeSegment, HistorySnapshot } from "../domain";
import { HistoryService } from "../services/history_service";
import { segmentStore } from "./segment_store.svelte";
import { episodeStore } from "./episode_store.svelte";
import { subtitleStore } from "./subtitle_store.svelte";

class HistoryStore {
  private historyService = new HistoryService();

  saveFullSnapshot(
    episodes: VideoMetadata[],
    segments: EpisodeSegment[],
    selectedEpisodeId: string | null,
    selectedSegmentId: string | null,
    selectedSubtitleTracks: Record<string, number | null>,
  ) {
    this.historyService.saveFullSnapshot(
      episodes, segments, selectedEpisodeId, selectedSegmentId, selectedSubtitleTracks,
    );
  }

  saveSegmentSnapshot(segments: EpisodeSegment[]) {
    this.historyService.saveSegmentSnapshot(segments);
  }

  undoFull(): HistorySnapshot | null {
    return this.historyService.undoFull();
  }

  redoFull(): HistorySnapshot | null {
    return this.historyService.redoFull();
  }

  undoSegment(): EpisodeSegment[] | null {
    return this.historyService.undoSegment();
  }

  redoSegment(): EpisodeSegment[] | null {
    return this.historyService.redoSegment();
  }

  pushCurrentToSegFuture(segments: EpisodeSegment[]) {
    this.historyService.pushCurrentToSegFuture(segments);
  }

  pushCurrentToSegStack(segments: EpisodeSegment[]) {
    this.historyService.pushCurrentToSegStack(segments);
  }

  canUndoSegment(): boolean {
    return this.historyService.canUndoSegment();
  }

  canRedoSegment(): boolean {
    return this.historyService.canRedoSegment();
  }

  smartUndo() {
    if (this.canUndoSegment()) {
      const prev = this.undoSegment();
      if (prev) {
        this.pushCurrentToSegFuture(segmentStore.segments);
        segmentStore.segments = prev;
        segmentStore.recalculateOffsets();
        return;
      }
    }
    const snapshot = this.undoFull();
    if (snapshot) this.restoreSnapshot(snapshot);
  }

  smartRedo() {
    if (this.canRedoSegment()) {
      const next = this.redoSegment();
      if (next) {
        this.pushCurrentToSegStack(segmentStore.segments);
        segmentStore.segments = next;
        segmentStore.recalculateOffsets();
        return;
      }
    }
    const snapshot = this.redoFull();
    if (snapshot) this.restoreSnapshot(snapshot);
  }

  private restoreSnapshot(snapshot: {
    episodes: VideoMetadata[];
    segments: EpisodeSegment[];
    selectedEpisodeId: string | null;
    selectedSegmentId: string | null;
    selectedSubtitleTracks: Record<string, number | null>;
  }) {
    episodeStore.episodes = snapshot.episodes;
    segmentStore.segments = snapshot.segments;
    episodeStore.selectedEpisodeId = snapshot.selectedEpisodeId;
    segmentStore.selectedSegmentId = snapshot.selectedSegmentId;
    subtitleStore.selectedSubtitleTracks = snapshot.selectedSubtitleTracks;
    segmentStore.recalculateOffsets();
  }

  clear() {
    this.historyService.clear();
  }
}

export const historyStore = new HistoryStore();
