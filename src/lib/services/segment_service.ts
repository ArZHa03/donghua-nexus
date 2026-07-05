import type { EpisodeSegment } from "../domain";

export interface SegmentEditResult {
  segments: EpisodeSegment[];
  newSegmentId?: string;
  /** Index to start offset recalculation from */
  recalcFrom: number;
  /** If a segment was deleted and matched the currently selected one, return its id */
  clearedSelectionId?: string;
}

export class SegmentService {
  splitSegment(segments: EpisodeSegment[], global_ms: number, onSave: () => void): SegmentEditResult | null {
    const idx = segments.findIndex(s =>
      !s.deleted &&
      global_ms >= s.timeline_offset_ms &&
      global_ms <  s.timeline_offset_ms + (s.source_end_ms - s.source_start_ms)
    );
    if (idx === -1) return null;

    const seg = segments[idx];
    const timeInSeg = global_ms - seg.timeline_offset_ms;
    const splitSourceMs = seg.source_start_ms + timeInSeg;

    if (splitSourceMs <= seg.source_start_ms || splitSourceMs >= seg.source_end_ms) return null;

    onSave();

    const newId = crypto.randomUUID();
    const newSeg: EpisodeSegment = {
      id: newId,
      episode_id: seg.episode_id,
      source_start_ms: splitSourceMs,
      source_end_ms: seg.source_end_ms,
      timeline_offset_ms: 0,
      deleted: false,
    };

    seg.source_end_ms = splitSourceMs;
    const result: EpisodeSegment[] = [...segments];
    result.splice(idx + 1, 0, newSeg);

    return { segments: result, newSegmentId: newId, recalcFrom: idx };
  }

  deleteLeft(segments: EpisodeSegment[], global_ms: number, selectedSegmentId: string | null, onSave: () => void): SegmentEditResult | null {
    const idx = segments.findIndex(s =>
      !s.deleted &&
      global_ms >= s.timeline_offset_ms &&
      global_ms <= s.timeline_offset_ms + (s.source_end_ms - s.source_start_ms)
    );
    if (idx === -1) return null;

    const seg = segments[idx];
    onSave();

    const timeInSeg = global_ms - seg.timeline_offset_ms;
    const newSourceStart = seg.source_start_ms + timeInSeg;
    let clearedSelectionId: string | undefined;

    if (newSourceStart >= seg.source_end_ms) {
      seg.deleted = true;
      if (selectedSegmentId === seg.id) clearedSelectionId = seg.id;
    } else {
      seg.source_start_ms = newSourceStart;
    }

    return { segments: [...segments], recalcFrom: idx, clearedSelectionId };
  }

  deleteRight(segments: EpisodeSegment[], global_ms: number, selectedSegmentId: string | null, onSave: () => void): SegmentEditResult | null {
    const idx = segments.findIndex(s =>
      !s.deleted &&
      global_ms >= s.timeline_offset_ms &&
      global_ms <= s.timeline_offset_ms + (s.source_end_ms - s.source_start_ms)
    );
    if (idx === -1) return null;

    const seg = segments[idx];
    onSave();

    const timeInSeg = global_ms - seg.timeline_offset_ms;
    const newSourceEnd = seg.source_start_ms + timeInSeg;
    let clearedSelectionId: string | undefined;

    if (newSourceEnd <= seg.source_start_ms) {
      seg.deleted = true;
      if (selectedSegmentId === seg.id) clearedSelectionId = seg.id;
    } else {
      seg.source_end_ms = newSourceEnd;
    }

    return { segments: [...segments], recalcFrom: idx, clearedSelectionId };
  }

  softDeleteSegment(segments: EpisodeSegment[], segmentId: string, selectedSegmentId: string | null, onSave: () => void): SegmentEditResult | null {
    const idx = segments.findIndex(s => s.id === segmentId && !s.deleted);
    if (idx === -1) return null;

    const seg = segments[idx];
    onSave();

    seg.deleted = true;
    let clearedSelectionId: string | undefined;
    if (selectedSegmentId === segmentId) clearedSelectionId = segmentId;

    return { segments: [...segments], recalcFrom: idx, clearedSelectionId };
  }

  recalculateOffsetsFrom(segments: EpisodeSegment[], startIndex: number): EpisodeSegment[] {
    let offset = 0;
    if (startIndex > 0) {
      let prevIdx = startIndex - 1;
      while (prevIdx >= 0 && segments[prevIdx].deleted) {
        prevIdx--;
      }
      if (prevIdx >= 0) {
        const prevSeg = segments[prevIdx];
        offset = prevSeg.timeline_offset_ms + (prevSeg.source_end_ms - prevSeg.source_start_ms);
      }
    }

    const result = [...segments];
    for (let i = startIndex; i < result.length; i++) {
      const seg = { ...result[i] };
      if (seg.deleted) { result[i] = seg; continue; }
      seg.timeline_offset_ms = offset;
      result[i] = seg;
      offset += seg.source_end_ms - seg.source_start_ms;
    }
    return result;
  }
}
