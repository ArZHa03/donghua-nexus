import type { VideoMetadata, EpisodeSegment } from "../domain";
import { HistoryService } from "../services/history_service";
import { SegmentService, type SegmentEditResult } from "../services/segment_service";
import { EpisodeService, type RemoveEpisodeResult } from "../services/episode_service";

class ProjectStore {
  episodes  = $state<VideoMetadata[]>([]);
  segments  = $state<EpisodeSegment[]>([]);
  project_title = $state("Untitled Project");

  importing       = $state(false);
  importProgress  = $state(0);
  importTotal     = $state(0);

  isProcessing    = $state(false);
  processingLabel = $state("");
  processingDetails = $state<{ episodeIdx?: number; segmentIdx?: number } | null>(null);

  selectedEpisodeId = $state<string | null>(null);
  selectedSegmentId = $state<string | null>(null);
  selectedSubtitleTracks = $state<Record<string, number | null>>({});

  private historyService = new HistoryService();
  private segmentService = new SegmentService();
  private episodeService = new EpisodeService();

  // ── Derived views ─────────────────────────────────────────────────────────

  get selectedEpisode(): VideoMetadata | null {
    return this.episodes.find(e => e.id === this.selectedEpisodeId) ?? null;
  }

  get selectedSegment(): EpisodeSegment | null {
    return this.segments.find(s => s.id === this.selectedSegmentId) ?? null;
  }

  get activeSegments(): EpisodeSegment[] {
    return this.segments.filter(s => !s.deleted);
  }

  get segmentsByEpisode(): Map<string, EpisodeSegment[]> {
    const map = new Map<string, EpisodeSegment[]>();
    for (const seg of this.segments) {
      if (!seg.deleted) {
        const arr = map.get(seg.episode_id) ?? [];
        arr.push(seg);
        map.set(seg.episode_id, arr);
      }
    }
    return map;
  }

  get total_duration_ms(): number {
    return this.activeSegments.reduce(
      (sum, s) => sum + (s.source_end_ms - s.source_start_ms), 0
    );
  }

  get total_file_size_bytes(): number {
    return this.episodes.reduce((sum, e) => sum + e.file_size_bytes, 0);
  }

  // ── Undo / Redo ───────────────────────────────────────────────────────────

  saveSnapshot() {
    this.historyService.saveFullSnapshot(
      this.episodes, this.segments,
      this.selectedEpisodeId, this.selectedSegmentId,
      this.selectedSubtitleTracks,
    );
  }

  undo() { this.historyService.undoFull(); }
  redo() { this.historyService.redoFull(); }

  smartUndo() {
    if (this.historyService.canUndoSegment()) {
      const prev = this.historyService.undoSegment();
      if (prev) {
        this.historyService.pushCurrentToSegFuture(this.segments);
        this.segments = prev;
        this.recalculateOffsets();
        return;
      }
    }
    const snapshot = this.historyService.undoFull();
    if (snapshot) this.restoreSnapshot(snapshot);
  }

  smartRedo() {
    if (this.historyService.canRedoSegment()) {
      const next = this.historyService.redoSegment();
      if (next) {
        this.historyService.pushCurrentToSegStack(this.segments);
        this.segments = next;
        this.recalculateOffsets();
        return;
      }
    }
    const snapshot = this.historyService.redoFull();
    if (snapshot) this.restoreSnapshot(snapshot);
  }

  private restoreSnapshot(snapshot: {
    episodes: VideoMetadata[];
    segments: EpisodeSegment[];
    selectedEpisodeId: string | null;
    selectedSegmentId: string | null;
    selectedSubtitleTracks: Record<string, number | null>;
  }) {
    this.episodes = snapshot.episodes;
    this.segments = snapshot.segments;
    this.selectedEpisodeId = snapshot.selectedEpisodeId;
    this.selectedSegmentId = snapshot.selectedSegmentId;
    this.selectedSubtitleTracks = snapshot.selectedSubtitleTracks;
    this.recalculateOffsets();
  }

  // ── Segment editing ───────────────────────────────────────────────────────

  private applySegmentEdit(result: SegmentEditResult) {
    if (result.clearedSelectionId && this.selectedSegmentId === result.clearedSelectionId) {
      this.selectedSegmentId = null;
    }
    this.segments = result.segments;
    this.recalculateOffsetsFrom(result.recalcFrom);
  }

  splitSegment(global_ms: number) {
    const result = this.segmentService.splitSegment(
      this.segments, global_ms,
      () => this.historyService.saveSegmentSnapshot(this.segments),
    );
    if (result) this.applySegmentEdit(result);
  }

  deleteLeft(global_ms: number) {
    const result = this.segmentService.deleteLeft(
      this.segments, global_ms, this.selectedSegmentId,
      () => this.historyService.saveSegmentSnapshot(this.segments),
    );
    if (result) this.applySegmentEdit(result);
  }

  deleteRight(global_ms: number) {
    const result = this.segmentService.deleteRight(
      this.segments, global_ms, this.selectedSegmentId,
      () => this.historyService.saveSegmentSnapshot(this.segments),
    );
    if (result) this.applySegmentEdit(result);
  }

  softDeleteSegment(segmentId: string) {
    const result = this.segmentService.softDeleteSegment(
      this.segments, segmentId, this.selectedSegmentId,
      () => this.historyService.saveSegmentSnapshot(this.segments),
    );
    if (result) this.applySegmentEdit(result);
  }

  setDetailsForSegment(seg: EpisodeSegment) {
    const epIdx = this.episodes.findIndex(e => e.id === seg.episode_id) + 1;
    const epSegs = this.segments.filter(s => s.episode_id === seg.episode_id && !s.deleted);
    const segIdx = epSegs.findIndex(s => s.id === seg.id) + 1;
    this.processingDetails = { episodeIdx: epIdx, segmentIdx: segIdx };
    this.historyService.saveSegmentSnapshot(this.segments);
  }

  // ── Episode management ────────────────────────────────────────────────────

  addEpisodes(files: VideoMetadata[]) {
    const result = this.episodeService.addEpisodes(
      this.episodes, this.segments, files, this.selectedEpisodeId,
    );
    this.episodes = result.episodes;
    this.segments = result.segments;
    this.selectedEpisodeId = result.newSelectedEpisodeId;
    this.selectedSegmentId = result.newSelectedSegmentId;
    this.recalculateOffsets();
  }

  async removeEpisode(episodeId: string) {
    if (!this.episodes.some(e => e.id === episodeId)) return;

    this.processingLabel = "Removing Episode...";
    this.isProcessing = true;
    this.processingDetails = null;
    await new Promise(resolve => setTimeout(resolve, 30));

    try {
      this.saveSnapshot();
      const result = this.episodeService.removeEpisode(
        this.episodes, this.segments, episodeId,
        this.selectedEpisodeId, this.selectedSegmentId,
        this.selectedSubtitleTracks,
      );
      this.applyRemoveResult(result);
    } finally {
      this.isProcessing = false;
      this.processingLabel = "";
      this.processingDetails = null;
    }
  }

  private applyRemoveResult(result: RemoveEpisodeResult) {
    this.episodes = result.episodes;
    this.segments = result.segments;
    this.selectedSubtitleTracks = result.selectedSubtitleTracks;
    this.selectedEpisodeId = result.newSelectedEpisodeId;
    this.selectedSegmentId = result.newSelectedSegmentId;
    this.recalculateOffsets();
  }

  // ── Subtitle tracks ──────────────────────────────────────────────────────

  setEpisodeSubtitleTrack(episodeId: string, trackIndex: number | null) {
    this.selectedSubtitleTracks[episodeId] = trackIndex;
  }

  getEpisodeSubtitleTrack(episodeId: string): number | null {
    if (this.selectedSubtitleTracks[episodeId] === undefined) {
      const ep = this.episodes.find(e => e.id === episodeId);
      return (ep && ep.subtitle_tracks.length > 0) ? 0 : null;
    }
    return this.selectedSubtitleTracks[episodeId];
  }

  // ── Offsets ───────────────────────────────────────────────────────────────

  recalculateOffsetsFrom(startIndex: number) {
    this.segments = this.segmentService.recalculateOffsetsFrom(this.segments, startIndex);
  }

  recalculateOffsets() {
    this.recalculateOffsetsFrom(0);
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  clear() {
    this.episodes         = [];
    this.segments         = [];
    this.importing        = false;
    this.importProgress   = 0;
    this.importTotal      = 0;
    this.isProcessing     = false;
    this.processingLabel  = "";
    this.processingDetails = null;
    this.project_title    = "Untitled Project";
    this.selectedEpisodeId = null;
    this.selectedSegmentId = null;
    this.selectedSubtitleTracks = {};
    this.historyService.clear();
  }
}

export const projectStore = new ProjectStore();
