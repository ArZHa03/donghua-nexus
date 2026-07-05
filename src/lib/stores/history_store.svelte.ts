import type { VideoMetadata, EpisodeSegment, HistorySnapshot } from "../domain";
import { HistoryService } from "../services/history_service";

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

  clear() {
    this.historyService.clear();
  }
}

export const historyStore = new HistoryStore();
