import type { VideoMetadata, EpisodeSegment } from "../domain";
import { EpisodeService, type RemoveEpisodeResult } from "../services/episode_service";
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

  // ── Backward-compatible state accessors (delegate to child stores) ────────

  project_title = $state("Untitled Project");

  get episodes() { return this.episodeStore.episodes; }
  set episodes(v) { this.episodeStore.episodes = v; }

  get segments() { return this.segmentStore.segments; }
  set segments(v) { this.segmentStore.segments = v; }

  get importing() { return this.processingStore.importing; }
  set importing(v) { this.processingStore.importing = v; }

  get importProgress() { return this.processingStore.importProgress; }
  set importProgress(v) { this.processingStore.importProgress = v; }

  get importTotal() { return this.processingStore.importTotal; }
  set importTotal(v) { this.processingStore.importTotal = v; }

  get isProcessing() { return this.processingStore.isProcessing; }
  set isProcessing(v) { this.processingStore.isProcessing = v; }

  get processingLabel() { return this.processingStore.processingLabel; }
  set processingLabel(v) { this.processingStore.processingLabel = v; }

  get processingDetails() { return this.processingStore.processingDetails; }
  set processingDetails(v) { this.processingStore.processingDetails = v; }

  get selectedEpisodeId() { return this.episodeStore.selectedEpisodeId; }
  set selectedEpisodeId(v) { this.episodeStore.selectedEpisodeId = v; }

  get selectedSegmentId() { return this.segmentStore.selectedSegmentId; }
  set selectedSegmentId(v) { this.segmentStore.selectedSegmentId = v; }

  get selectedSubtitleTracks() { return this.subtitleStore.selectedSubtitleTracks; }
  set selectedSubtitleTracks(v) { this.subtitleStore.selectedSubtitleTracks = v; }

  // ── Backward-compatible derived getters ───────────────────────────────────

  get selectedEpisode(): VideoMetadata | null {
    return this.episodeStore.selectedEpisode;
  }

  get selectedSegment(): EpisodeSegment | null {
    return this.segmentStore.selectedSegment;
  }

  get activeSegments(): EpisodeSegment[] {
    return this.segmentStore.activeSegments;
  }

  get segmentsByEpisode(): Map<string, EpisodeSegment[]> {
    return this.segmentStore.segmentsByEpisode;
  }

  get total_duration_ms(): number {
    return this.segmentStore.total_duration_ms;
  }

  get total_file_size_bytes(): number {
    return this.episodeStore.total_file_size_bytes;
  }

  // ── Episode management ────────────────────────────────────────────────────

  private episodeService: EpisodeService = new EpisodeService();

  addEpisodes(files: VideoMetadata[]) {
    const result = this.episodeService.addEpisodes(
      this.episodeStore.episodes, this.segmentStore.segments,
      files, this.episodeStore.selectedEpisodeId,
    );
    this.episodeStore.episodes = result.episodes;
    this.segmentStore.segments = result.segments;
    this.episodeStore.selectedEpisodeId = result.newSelectedEpisodeId;
    this.segmentStore.selectedSegmentId = result.newSelectedSegmentId;
    this.segmentStore.recalculateOffsets();
  }

  async removeEpisode(episodeId: string) {
    if (!this.episodeStore.episodes.some(e => e.id === episodeId)) return;

    this.processingStore.processingLabel = "Removing Episode...";
    this.processingStore.isProcessing = true;
    this.processingStore.processingDetails = null;
    await new Promise(resolve => setTimeout(resolve, 30));

    try {
      this.saveSnapshot();
      const result = this.episodeService.removeEpisode(
        this.episodeStore.episodes, this.segmentStore.segments,
        episodeId,
        this.episodeStore.selectedEpisodeId, this.segmentStore.selectedSegmentId,
        this.subtitleStore.selectedSubtitleTracks,
      );
      this.applyRemoveResult(result);
    } finally {
      this.processingStore.isProcessing = false;
      this.processingStore.processingLabel = "";
      this.processingStore.processingDetails = null;
    }
  }

  private applyRemoveResult(result: RemoveEpisodeResult) {
    this.episodeStore.episodes = result.episodes;
    this.segmentStore.segments = result.segments;
    this.subtitleStore.selectedSubtitleTracks = result.selectedSubtitleTracks;
    this.episodeStore.selectedEpisodeId = result.newSelectedEpisodeId;
    this.segmentStore.selectedSegmentId = result.newSelectedSegmentId;
    this.segmentStore.recalculateOffsets();
  }

  // ── Undo / Redo ───────────────────────────────────────────────────────────

  saveSnapshot() {
    this.historyStore.saveFullSnapshot(
      this.episodeStore.episodes, this.segmentStore.segments,
      this.episodeStore.selectedEpisodeId, this.segmentStore.selectedSegmentId,
      this.subtitleStore.selectedSubtitleTracks,
    );
  }

  undo() { this.historyStore.undoFull(); }
  redo() { this.historyStore.redoFull(); }

  smartUndo() {
    if (this.historyStore.canUndoSegment()) {
      const prev = this.historyStore.undoSegment();
      if (prev) {
        this.historyStore.pushCurrentToSegFuture(this.segmentStore.segments);
        this.segmentStore.segments = prev;
        this.segmentStore.recalculateOffsets();
        return;
      }
    }
    const snapshot = this.historyStore.undoFull();
    if (snapshot) this.restoreSnapshot(snapshot);
  }

  smartRedo() {
    if (this.historyStore.canRedoSegment()) {
      const next = this.historyStore.redoSegment();
      if (next) {
        this.historyStore.pushCurrentToSegStack(this.segmentStore.segments);
        this.segmentStore.segments = next;
        this.segmentStore.recalculateOffsets();
        return;
      }
    }
    const snapshot = this.historyStore.redoFull();
    if (snapshot) this.restoreSnapshot(snapshot);
  }

  private restoreSnapshot(snapshot: {
    episodes: VideoMetadata[];
    segments: EpisodeSegment[];
    selectedEpisodeId: string | null;
    selectedSegmentId: string | null;
    selectedSubtitleTracks: Record<string, number | null>;
  }) {
    this.episodeStore.episodes = snapshot.episodes;
    this.segmentStore.segments = snapshot.segments;
    this.episodeStore.selectedEpisodeId = snapshot.selectedEpisodeId;
    this.segmentStore.selectedSegmentId = snapshot.selectedSegmentId;
    this.subtitleStore.selectedSubtitleTracks = snapshot.selectedSubtitleTracks;
    this.segmentStore.recalculateOffsets();
  }

  // ── Segment editing ───────────────────────────────────────────────────────

  splitSegment(global_ms: number) {
    const result = this.segmentStore.splitSegment(
      global_ms,
      () => this.historyStore.saveSegmentSnapshot(this.segmentStore.segments),
    );
    if (result) this.segmentStore.applySegmentEdit(result);
  }

  deleteLeft(global_ms: number) {
    const result = this.segmentStore.deleteLeft(
      global_ms,
      () => this.historyStore.saveSegmentSnapshot(this.segmentStore.segments),
    );
    if (result) this.segmentStore.applySegmentEdit(result);
  }

  deleteRight(global_ms: number) {
    const result = this.segmentStore.deleteRight(
      global_ms,
      () => this.historyStore.saveSegmentSnapshot(this.segmentStore.segments),
    );
    if (result) this.segmentStore.applySegmentEdit(result);
  }

  softDeleteSegment(segmentId: string) {
    const result = this.segmentStore.softDeleteSegment(
      segmentId,
      () => this.historyStore.saveSegmentSnapshot(this.segmentStore.segments),
    );
    if (result) this.segmentStore.applySegmentEdit(result);
  }

  setDetailsForSegment(seg: EpisodeSegment) {
    const epIdx = this.episodeStore.episodes.findIndex(e => e.id === seg.episode_id) + 1;
    const epSegs = this.segmentStore.segments.filter(s => s.episode_id === seg.episode_id && !s.deleted);
    const segIdx = epSegs.findIndex(s => s.id === seg.id) + 1;
    this.processingStore.processingDetails = { episodeIdx: epIdx, segmentIdx: segIdx };
    this.historyStore.saveSegmentSnapshot(this.segmentStore.segments);
  }

  // ── Subtitle tracks ──────────────────────────────────────────────────────

  setEpisodeSubtitleTrack(episodeId: string, trackIndex: number | null) {
    this.subtitleStore.setEpisodeSubtitleTrack(episodeId, trackIndex);
  }

  getEpisodeSubtitleTrack(episodeId: string): number | null {
    return this.subtitleStore.getEpisodeSubtitleTrack(episodeId, this.episodeStore.episodes);
  }

  // ── Offsets ───────────────────────────────────────────────────────────────

  recalculateOffsetsFrom(startIndex: number) {
    this.segmentStore.recalculateOffsetsFrom(startIndex);
  }

  recalculateOffsets() {
    this.segmentStore.recalculateOffsets();
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  clear() {
    this.episodeStore.clear();
    this.segmentStore.clear();
    this.historyStore.clear();
    this.processingStore.clear();
    this.subtitleStore.clear();
    this.project_title = "Untitled Project";
  }
}

export const projectStore = new ProjectStore();
