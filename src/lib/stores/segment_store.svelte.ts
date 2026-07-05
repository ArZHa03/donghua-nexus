import type { EpisodeSegment } from "../domain";
import { SegmentService, type SegmentEditResult } from "../services/segment_service";

class SegmentStore {
  segments = $state<EpisodeSegment[]>([]);
  selectedSegmentId = $state<string | null>(null);

  private segmentService = new SegmentService();

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

  splitSegment(global_ms: number, onSave: () => void): SegmentEditResult | null {
    return this.segmentService.splitSegment(this.segments, global_ms, onSave);
  }

  deleteLeft(global_ms: number, onSave: () => void): SegmentEditResult | null {
    return this.segmentService.deleteLeft(this.segments, global_ms, this.selectedSegmentId, onSave);
  }

  deleteRight(global_ms: number, onSave: () => void): SegmentEditResult | null {
    return this.segmentService.deleteRight(this.segments, global_ms, this.selectedSegmentId, onSave);
  }

  softDeleteSegment(segmentId: string, onSave: () => void): SegmentEditResult | null {
    return this.segmentService.softDeleteSegment(this.segments, segmentId, this.selectedSegmentId, onSave);
  }

  applySegmentEdit(result: SegmentEditResult) {
    if (result.clearedSelectionId && this.selectedSegmentId === result.clearedSelectionId) {
      this.selectedSegmentId = null;
    }
    this.segments = result.segments;
    this.recalculateOffsetsFrom(result.recalcFrom);
  }

  recalculateOffsetsFrom(startIndex: number) {
    this.segments = this.segmentService.recalculateOffsetsFrom(this.segments, startIndex);
  }

  recalculateOffsets() {
    this.recalculateOffsetsFrom(0);
  }

  clear() {
    this.segments = [];
    this.selectedSegmentId = null;
  }
}

export const segmentStore = new SegmentStore();
