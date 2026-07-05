import type { VideoMetadata, EpisodeSegment } from "../domain";

export interface ProjectStoreGateway {
  episodes: VideoMetadata[];
  segments: EpisodeSegment[];
  segmentsByEpisode: Map<string, EpisodeSegment[]>;
  selectedEpisodeId: string | null;
  selectedSegmentId: string | null;
}

export interface PlaybackStoreGateway {
  isIdle: boolean;
  isBusy: boolean;
  isReady: boolean;
  playhead_ms: number;
  setMpvState(state: string): void;
  setPlayhead(ms: number): void;
  togglePlay(): void;
}

export interface TauriGateway {
  mpvStart(): Promise<void>;
  mpvLoadFile(path: string, startSec: number): Promise<void>;
  mpvTogglePause(): Promise<void>;
  mpvFrameStep(direction: "forward" | "backward"): Promise<void>;
  mpvUnload(): Promise<void>;
}

export class PlaybackService {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private project: ProjectStoreGateway,
    private playback: PlaybackStoreGateway,
    private tauri: TauriGateway,
  ) {}

  selectEpisodeForPreview(episodeId: string, segmentId?: string) {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this._select(episodeId, segmentId);
    }, 150);
  }

  private async _select(episodeId: string, segmentId?: string) {
    if (this.playback.isBusy) return;

    const ep = this.project.episodes.find(e => e.id === episodeId);
    if (!ep) return;

    const segs = this.project.segmentsByEpisode.get(episodeId) ?? [];
    const targetSeg = segmentId ? segs.find(s => s.id === segmentId) : segs[0];

    this.project.selectedEpisodeId = episodeId;
    this.project.selectedSegmentId = targetSeg?.id ?? null;

    if (targetSeg) {
      this.playback.setPlayhead(targetSeg.timeline_offset_ms);
    }

    try {
      if (this.playback.isIdle) {
        this.playback.setMpvState('starting');
        await this.tauri.mpvStart();
      }

      this.playback.setMpvState('loading');
      const startSec = targetSeg ? targetSeg.source_start_ms / 1000 : 0;
      await this.tauri.mpvLoadFile(ep.path, startSec);
    } catch (err) {
      console.error('MPV error during episode selection:', err);
      this.playback.setMpvState('error');
    }
  }

  async togglePause() {
    if (!this.playback.isReady) return;
    await this.tauri.mpvTogglePause();
    this.playback.togglePlay();
  }

  async stepFrame(direction: "forward" | "backward") {
    if (!this.playback.isReady) return;
    await this.tauri.mpvFrameStep(direction);
  }

  async unloadIfEmpty(episodeCount: number) {
    if (episodeCount === 0 && this.playback.isReady) {
      await this.tauri.mpvUnload().catch(err => console.error('mpvUnload failed:', err));
      this.playback.setMpvState('not_started');
    }
  }

  cancelDebounce() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}
