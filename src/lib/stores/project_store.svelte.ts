import type { VideoMetadata, EpisodeSegment } from "../types";

interface HistorySnapshot {
  episodes: VideoMetadata[];
  segments: EpisodeSegment[];
  selectedEpisodeId: string | null;
  selectedSegmentId: string | null;
  selectedSubtitleTracks: Record<string, number | null>;
}

class ProjectStore {
  episodes  = $state<VideoMetadata[]>([]);
  segments  = $state<EpisodeSegment[]>([]);
  project_title = $state("Untitled Project");

  // Import progress
  importing       = $state(false);
  importProgress  = $state(0);
  importTotal     = $state(0);

  // Processing state for heavy UI blocking operations
  isProcessing    = $state(false);
  processingLabel = $state("");
  processingDetails = $state<{ episodeIdx?: number; segmentIdx?: number } | null>(null);

  // ── Selection ────────────────────────────────────────────────────────────
  selectedEpisodeId = $state<string | null>(null);
  selectedSegmentId = $state<string | null>(null);

  // ── Subtitle Selections ──────────────────────────────────────────────────
  // key: episodeId, value: index of subtitle track (or null if disabled)
  selectedSubtitleTracks = $state<Record<string, number | null>>({});

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

  get selectedEpisode(): VideoMetadata | null {
    return this.episodes.find(e => e.id === this.selectedEpisodeId) ?? null;
  }

  get selectedSegment(): EpisodeSegment | null {
    return this.segments.find(s => s.id === this.selectedSegmentId) ?? null;
  }

  // ── Derived views ─────────────────────────────────────────────────────────

  /** Only non-deleted segments, sorted by timeline_offset_ms. Used for rendering. */
  get activeSegments(): EpisodeSegment[] {
    return this.segments.filter(s => !s.deleted);
  }

  /** Active segments grouped by episode_id. Used for intro/outro template + encoding. */
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

  /** Sum of all active segment durations. */
  get total_duration_ms(): number {
    return this.activeSegments.reduce(
      (sum, s) => sum + (s.source_end_ms - s.source_start_ms),
      0
    );
  }

  get total_file_size_bytes(): number {
    return this.episodes.reduce((sum, e) => sum + e.file_size_bytes, 0);
  }

  // ── History (Undo/Redo) Stack ─────────────────────────────────────────────
  historyStack: HistorySnapshot[] = [];
  futureStack: HistorySnapshot[] = [];

  saveSnapshot() {
    // Deep clone segments, episodes, and subtitle selections
    const segmentsCopy = this.segments.map(s => ({ ...s }));
    const episodesCopy = this.episodes.map(e => ({
      ...e,
      subtitle_tracks: e.subtitle_tracks.map(t => ({ ...t }))
    }));
    const subtitleTracksCopy = { ...this.selectedSubtitleTracks };

    this.historyStack.push({
      episodes: episodesCopy,
      segments: segmentsCopy,
      selectedEpisodeId: this.selectedEpisodeId,
      selectedSegmentId: this.selectedSegmentId,
      selectedSubtitleTracks: subtitleTracksCopy
    });

    this.futureStack = []; // Clear redo stack on new action

    if (this.historyStack.length > 50) {
      this.historyStack.shift();
    }
  }

  undo() {
    if (this.historyStack.length === 0) return;

    // Save current state for Redo
    const currentSegments = this.segments.map(s => ({ ...s }));
    const currentEpisodes = this.episodes.map(e => ({
      ...e,
      subtitle_tracks: e.subtitle_tracks.map(t => ({ ...t }))
    }));
    const currentSubtitleTracks = { ...this.selectedSubtitleTracks };

    this.futureStack.push({
      episodes: currentEpisodes,
      segments: currentSegments,
      selectedEpisodeId: this.selectedEpisodeId,
      selectedSegmentId: this.selectedSegmentId,
      selectedSubtitleTracks: currentSubtitleTracks
    });

    // Pop and apply snapshot
    const snapshot = this.historyStack.pop()!;
    this.episodes = snapshot.episodes;
    this.segments = snapshot.segments;
    this.selectedEpisodeId = snapshot.selectedEpisodeId;
    this.selectedSegmentId = snapshot.selectedSegmentId;
    this.selectedSubtitleTracks = snapshot.selectedSubtitleTracks;

    this.recalculateOffsets();
  }

  redo() {
    if (this.futureStack.length === 0) return;

    // Save current state for Undo
    const currentSegments = this.segments.map(s => ({ ...s }));
    const currentEpisodes = this.episodes.map(e => ({
      ...e,
      subtitle_tracks: e.subtitle_tracks.map(t => ({ ...t }))
    }));
    const currentSubtitleTracks = { ...this.selectedSubtitleTracks };

    this.historyStack.push({
      episodes: currentEpisodes,
      segments: currentSegments,
      selectedEpisodeId: this.selectedEpisodeId,
      selectedSegmentId: this.selectedSegmentId,
      selectedSubtitleTracks: currentSubtitleTracks
    });

    // Pop and apply snapshot
    const snapshot = this.futureStack.pop()!;
    this.episodes = snapshot.episodes;
    this.segments = snapshot.segments;
    this.selectedEpisodeId = snapshot.selectedEpisodeId;
    this.selectedSegmentId = snapshot.selectedSegmentId;
    this.selectedSubtitleTracks = snapshot.selectedSubtitleTracks;

    this.recalculateOffsets();
  }

  // ── Import ────────────────────────────────────────────────────────────────

  addEpisodes(files: VideoMetadata[]) {
    for (const file of files) {
      if (!this.episodes.some(e => e.path === file.path)) {
        this.episodes.push(file);

        // Auto-create one segment covering the full episode
        const seg: EpisodeSegment = {
          id: crypto.randomUUID(),
          episode_id: file.id,
          source_start_ms: 0,
          source_end_ms: file.duration_ms,
          timeline_offset_ms: 0, // Recalculated below
          deleted: false,
        };
        this.segments.push(seg);
      }
    }
    this.recalculateOffsets();

    // Auto-select first episode + its first segment if nothing is selected
    if (!this.selectedEpisodeId && this.episodes.length > 0) {
      const firstEp  = this.episodes[0];
      const firstSeg = this.segments.find(s => s.episode_id === firstEp.id && !s.deleted);
      this.selectedEpisodeId = firstEp.id;
      this.selectedSegmentId = firstSeg?.id ?? null;
    }
  }

  async removeEpisode(episodeId: string) {
    if (!this.episodes.some(e => e.id === episodeId)) return;

    this.processingLabel = "Removing Episode...";
    this.isProcessing = true;
    this.processingDetails = null;
    // Brief timeout so UI renders the blocking overlay
    await new Promise(resolve => setTimeout(resolve, 30));

    try {
      this.saveSnapshot();
      this.episodes = this.episodes.filter(e => e.id !== episodeId);
      this.segments = this.segments.filter(s => s.episode_id !== episodeId);

      // Clean up subtitle selections map entry
      delete this.selectedSubtitleTracks[episodeId];

      // Clear selection if the removed episode was selected
      if (this.selectedEpisodeId === episodeId) {
        this.selectedEpisodeId = this.episodes[0]?.id ?? null;
        const firstSeg = this.segments.find(
          s => s.episode_id === this.selectedEpisodeId && !s.deleted
        );
        this.selectedSegmentId = firstSeg?.id ?? null;
      }

      this.recalculateOffsets();
    } finally {
      this.isProcessing = false;
      this.processingLabel = "";
      this.processingDetails = null;
    }
  }

  // ── Offsets ───────────────────────────────────────────────────────────────

  /**
   * Incremental recalculation of timeline offsets starting from `startIndex`.
   * Only mutates changed values to prevent triggering unnecessary Svelte reactivity.
   */
  recalculateOffsetsFrom(startIndex: number) {
    let offset = 0;
    if (startIndex > 0) {
      // Find the last active segment before startIndex
      let prevIdx = startIndex - 1;
      while (prevIdx >= 0 && this.segments[prevIdx].deleted) {
        prevIdx--;
      }
      if (prevIdx >= 0) {
        const prevSeg = this.segments[prevIdx];
        offset = prevSeg.timeline_offset_ms + (prevSeg.source_end_ms - prevSeg.source_start_ms);
      }
    }

    for (let i = startIndex; i < this.segments.length; i++) {
      const seg = this.segments[i];
      if (seg.deleted) continue;
      
      if (seg.timeline_offset_ms !== offset) {
        seg.timeline_offset_ms = offset;
      }
      offset += seg.source_end_ms - seg.source_start_ms;
    }
  }

  recalculateOffsets() {
    this.recalculateOffsetsFrom(0);
  }

  // ── Editing Helpers ───────────────────────────────────────────────────────

  setDetailsForSegment(seg: EpisodeSegment) {
    const epIdx = this.episodes.findIndex(e => e.id === seg.episode_id) + 1;
    const epSegs = this.segmentsByEpisode.get(seg.episode_id) ?? [];
    const segIdx = epSegs.findIndex(s => s.id === seg.id) + 1;
    this.processingDetails = { episodeIdx: epIdx, segmentIdx: segIdx };
  }

  // ── Editing operations (virtual — no file mutation) ───────────────────────

  /** Split the segment containing `global_ms` into two segments. */
  splitSegment(global_ms: number) {
    const idx = this.segments.findIndex(s =>
      !s.deleted &&
      global_ms >= s.timeline_offset_ms &&
      global_ms <  s.timeline_offset_ms + (s.source_end_ms - s.source_start_ms)
    );
    if (idx === -1) return;

    const seg = this.segments[idx];
    const timeInSeg     = global_ms - seg.timeline_offset_ms;
    const splitSourceMs = seg.source_start_ms + timeInSeg;

    // Refuse split at exact boundaries
    if (splitSourceMs <= seg.source_start_ms || splitSourceMs >= seg.source_end_ms) return;

    this.setDetailsForSegment(seg);
    this.saveSnapshot();

    const newSeg: EpisodeSegment = {
      id: crypto.randomUUID(),
      episode_id: seg.episode_id,
      source_start_ms: splitSourceMs,
      source_end_ms: seg.source_end_ms,
      timeline_offset_ms: 0,
      deleted: false,
    };

    seg.source_end_ms = splitSourceMs;
    this.segments.splice(idx + 1, 0, newSeg);
    this.recalculateOffsetsFrom(idx);
  }

  /** Delete from segment start up to `global_ms` (ripple left). */
  deleteLeft(global_ms: number) {
    const idx = this.segments.findIndex(s =>
      !s.deleted &&
      global_ms >= s.timeline_offset_ms &&
      global_ms <= s.timeline_offset_ms + (s.source_end_ms - s.source_start_ms)
    );
    if (idx === -1) return;

    const seg = this.segments[idx];
    this.setDetailsForSegment(seg);
    this.saveSnapshot();

    const timeInSeg    = global_ms - seg.timeline_offset_ms;
    const newSourceStart = seg.source_start_ms + timeInSeg;

    if (newSourceStart >= seg.source_end_ms) {
      seg.deleted = true;
    } else {
      seg.source_start_ms = newSourceStart;
    }

    // Clear segment selection if it was deleted
    if (seg.deleted && this.selectedSegmentId === seg.id) {
      this.selectedSegmentId = null;
    }

    this.recalculateOffsetsFrom(idx);
  }

  /** Delete from `global_ms` to segment end (ripple right). */
  deleteRight(global_ms: number) {
    const idx = this.segments.findIndex(s =>
      !s.deleted &&
      global_ms >= s.timeline_offset_ms &&
      global_ms <= s.timeline_offset_ms + (s.source_end_ms - s.source_start_ms)
    );
    if (idx === -1) return;

    const seg = this.segments[idx];
    this.setDetailsForSegment(seg);
    this.saveSnapshot();

    const timeInSeg  = global_ms - seg.timeline_offset_ms;
    const newSourceEnd = seg.source_start_ms + timeInSeg;

    if (newSourceEnd <= seg.source_start_ms) {
      seg.deleted = true;
    } else {
      seg.source_end_ms = newSourceEnd;
    }

    if (seg.deleted && this.selectedSegmentId === seg.id) {
      this.selectedSegmentId = null;
    }

    this.recalculateOffsetsFrom(idx);
  }

  /** Soft-delete a specific segment by ID. */
  softDeleteSegment(segmentId: string) {
    const idx = this.segments.findIndex(s => s.id === segmentId && !s.deleted);
    if (idx === -1) return;

    const seg = this.segments[idx];
    this.setDetailsForSegment(seg);
    this.saveSnapshot();

    seg.deleted = true;
    
    if (this.selectedSegmentId === segmentId) {
      this.selectedSegmentId = null;
    }
    
    this.recalculateOffsetsFrom(idx);
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
    this.historyStack     = [];
    this.futureStack      = [];
  }
}

export const projectStore = new ProjectStore();
