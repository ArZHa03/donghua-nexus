import type { VideoMetadata, EpisodeSegment, HistorySnapshot } from "../domain";

const MAX_STACK = 50;

export class HistoryService {
  private fullStack: HistorySnapshot[] = [];
  private fullFuture: HistorySnapshot[] = [];
  private segStack: EpisodeSegment[][] = [];
  private segFuture: EpisodeSegment[][] = [];

  private deepCloneEpisodes(eps: VideoMetadata[]): VideoMetadata[] {
    return eps.map(e => ({
      ...e,
      subtitle_tracks: e.subtitle_tracks.map(t => ({ ...t }))
    }));
  }

  private deepCloneSegments(segs: EpisodeSegment[]): EpisodeSegment[] {
    return segs.map(s => ({ ...s }));
  }

  saveFullSnapshot(
    episodes: VideoMetadata[],
    segments: EpisodeSegment[],
    selectedEpisodeId: string | null,
    selectedSegmentId: string | null,
    selectedSubtitleTracks: Record<string, number | null>,
  ) {
    this.fullStack.push({
      episodes: this.deepCloneEpisodes(episodes),
      segments: this.deepCloneSegments(segments),
      selectedEpisodeId,
      selectedSegmentId,
      selectedSubtitleTracks: { ...selectedSubtitleTracks },
    });
    this.fullFuture = [];
    if (this.fullStack.length > MAX_STACK) this.fullStack.shift();
  }

  saveSegmentSnapshot(segments: EpisodeSegment[]) {
    this.segStack.push(this.deepCloneSegments(segments));
    this.segFuture = [];
    if (this.segStack.length > MAX_STACK) this.segStack.shift();
  }

  undoFull(): HistorySnapshot | null {
    if (this.fullStack.length === 0) return null;
    return this.fullStack.pop()!;
  }

  redoFull(): HistorySnapshot | null {
    if (this.fullFuture.length === 0) return null;
    return this.fullFuture.pop()!;
  }

  pushCurrentToFullFuture(
    episodes: VideoMetadata[],
    segments: EpisodeSegment[],
    selectedEpisodeId: string | null,
    selectedSegmentId: string | null,
    selectedSubtitleTracks: Record<string, number | null>,
  ) {
    this.fullFuture.push({
      episodes: this.deepCloneEpisodes(episodes),
      segments: this.deepCloneSegments(segments),
      selectedEpisodeId,
      selectedSegmentId,
      selectedSubtitleTracks: { ...selectedSubtitleTracks },
    });
  }

  pushCurrentToFullStack(
    episodes: VideoMetadata[],
    segments: EpisodeSegment[],
    selectedEpisodeId: string | null,
    selectedSegmentId: string | null,
    selectedSubtitleTracks: Record<string, number | null>,
  ) {
    this.fullStack.push({
      episodes: this.deepCloneEpisodes(episodes),
      segments: this.deepCloneSegments(segments),
      selectedEpisodeId,
      selectedSegmentId,
      selectedSubtitleTracks: { ...selectedSubtitleTracks },
    });
  }

  undoSegment(): EpisodeSegment[] | null {
    if (this.segStack.length === 0) return null;
    return this.segStack.pop()!;
  }

  redoSegment(): EpisodeSegment[] | null {
    if (this.segFuture.length === 0) return null;
    return this.segFuture.pop()!;
  }

  pushCurrentToSegFuture(segments: EpisodeSegment[]) {
    this.segFuture.push(this.deepCloneSegments(segments));
  }

  pushCurrentToSegStack(segments: EpisodeSegment[]) {
    this.segStack.push(this.deepCloneSegments(segments));
  }

  canUndoFull(): boolean { return this.fullStack.length > 0; }
  canRedoFull(): boolean { return this.fullFuture.length > 0; }
  canUndoSegment(): boolean { return this.segStack.length > 0; }
  canRedoSegment(): boolean { return this.segFuture.length > 0; }

  clear() {
    this.fullStack = [];
    this.fullFuture = [];
    this.segStack = [];
    this.segFuture = [];
  }
}
