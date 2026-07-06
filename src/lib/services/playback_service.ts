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
  mpv_state: string;
  playhead_ms: number;
  setMpvState(state: string): void;
  setPlayhead(ms: number): void;
  setSourceStartMs(ms: number): void;
  setTimelineOffsetMs(ms: number): void;
  togglePlay(): void;
}

export interface TauriGateway {
  mpvStart(): Promise<void>;
  mpvLoadFile(path: string, startSec: number): Promise<void>;
  mpvTogglePause(): Promise<void>;
  mpvFrameStep(direction: "forward" | "backward"): Promise<void>;
  mpvUnload(): Promise<void>;
}

const LOADING_TIMEOUT_MS = 15000;

export class PlaybackService {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private loadingTimer: ReturnType<typeof setTimeout> | null = null;

  private pendingEpisodeId: string | null = null;
  private pendingSegmentId: string | null = null;

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

  private _select(episodeId: string, segmentId?: string) {
    if (this.playback.isBusy) {
      this.pendingEpisodeId = episodeId;
      this.pendingSegmentId = segmentId ?? null;
      return;
    }

    this.clearLoadingTimer();

    const ep = this.project.episodes.find(e => e.id === episodeId);
    if (!ep) return;

    const segs = this.project.segmentsByEpisode.get(episodeId) ?? [];
    const targetSeg = segmentId ? segs.find(s => s.id === segmentId) : segs[0];

    this.project.selectedEpisodeId = episodeId;
    this.project.selectedSegmentId = targetSeg?.id ?? null;

    if (targetSeg) {
      this.playback.setTimelineOffsetMs(targetSeg.timeline_offset_ms);
      this.playback.setSourceStartMs(targetSeg.source_start_ms);
      this.playback.setPlayhead(targetSeg.timeline_offset_ms);
    }

    const seekSec = targetSeg ? targetSeg.source_start_ms / 1000 : 0;

    console.log('==============================');
    console.log('[PLAYBACK REQUEST]');
    console.log('==============================');
    console.log('Episode ID:', episodeId);
    console.log('Segment ID:', segmentId ?? '(none)');
    console.log('Timeline playhead:', this.playback.playhead_ms);
    console.log('Timeline offset:', targetSeg?.timeline_offset_ms);
    console.log('Source start:', targetSeg?.source_start_ms);
    console.log('Computed seek (sec):', seekSec);
    console.log('File path:', ep.path);
    console.log('==============================');

    this.executeLoad(ep.path, targetSeg).catch(() => {
      this.drainPending();
    });
  }

  private async executeLoad(path: string, targetSeg: EpisodeSegment | undefined) {
    try {
      console.log('[LIFECYCLE] executeLoad: mpv_state=' + this.playback.mpv_state);

      if (this.playback.isIdle) {
        console.log('[LIFECYCLE] executeLoad: state is idle, calling mpvStart');
        this.playback.setMpvState('starting');
        await this.tauri.mpvStart();
        console.log('[LIFECYCLE] executeLoad: mpvStart done');
      }

      console.log('[LIFECYCLE] executeLoad: setting loading, calling mpvLoadFile');
      this.playback.setMpvState('loading');
      const startSec = targetSeg ? targetSeg.source_start_ms / 1000 : 0;

      this.loadingTimer = setTimeout(() => {
        console.error('[PLAYBACK ERROR] Loading timed out after', LOADING_TIMEOUT_MS, 'ms');
        this.playback.setMpvState('error');
        this.clearLoadingTimer();
        this.drainPending();
      }, LOADING_TIMEOUT_MS);

      await this.tauri.mpvLoadFile(path, startSec);
    } catch (err) {
      console.error('==============================');
      console.error('[PLAYBACK ERROR]');
      console.error('==============================');
      console.error('Error:', err);
      if (err instanceof Error) {
        console.error('Message:', err.message);
        console.error('Stack:', err.stack);
      }
      console.error('==============================');
      this.playback.setMpvState('error');
      this.clearLoadingTimer();
      this.drainPending();
    }
  }

  notifyFileLoaded() {
    this.clearLoadingTimer();
    this.drainPending();
  }

  notifyError() {
    this.clearLoadingTimer();
    this.drainPending();
  }

  private drainPending() {
    if (this.pendingEpisodeId) {
      const epId = this.pendingEpisodeId;
      const segId = this.pendingSegmentId;
      this.pendingEpisodeId = null;
      this.pendingSegmentId = null;
      this._select(epId, segId ?? undefined);
    }
  }

  private clearLoadingTimer() {
    if (this.loadingTimer) {
      clearTimeout(this.loadingTimer);
      this.loadingTimer = null;
    }
  }

  async togglePause() {
    if (!this.playback.isReady) return;
    await this.tauri.mpvTogglePause();
  }

  async stepFrame(direction: "forward" | "backward") {
    if (!this.playback.isReady) return;
    await this.tauri.mpvFrameStep(direction);
  }

  async unloadIfEmpty(episodeCount: number) {
    if (episodeCount === 0 && this.playback.isReady) {
      await this.tauri.mpvUnload().catch(err => console.error('mpvUnload failed:', err));
      this.playback.setMpvState('not_started');
      this.playback.setPlayhead(0);
    }
  }

  cancelDebounce() {
    this.clearLoadingTimer();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}
