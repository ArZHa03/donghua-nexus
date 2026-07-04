/**
 * MPV process lifecycle state.
 *
 * NOTE (future): The `loading → ready` transition currently fires immediately
 * after a successful loadfile IPC write. In the realtime-sync milestone this
 * should be driven by actual MPV events (file-loaded / playback-restart /
 * observe_property) instead.
 */
export type MpvLifecycle =
  | 'not_started' // MPV process does not exist yet
  | 'starting'    // mpvStart() in progress, waiting for pipe connection
  | 'loading'     // loadfile command sent, MPV is seeking/buffering
  | 'ready'       // File loaded, playback paused at target position
  | 'playing'     // MPV is actively playing
  | 'paused'      // MPV paused by user
  | 'error';      // Unrecoverable pipe/process failure

class PlaybackStore {
  playhead_ms = $state(0);
  mpv_state   = $state<MpvLifecycle>('not_started');

  // Timeline Zoom Settings
  zoom_mode   = $state<'fit-entire' | 'fit-episode' | 'manual'>('manual');
  zoom_factor = $state(1.0); // manual scale multiplier

  // ── Lifecycle helpers ────────────────────────────────────────────────────

  /** True when no file is loaded and controls should be hidden. */
  get isIdle(): boolean {
    return this.mpv_state === 'not_started' || this.mpv_state === 'error';
  }

  /** True when a file is loaded and transport controls are usable. */
  get isReady(): boolean {
    return (
      this.mpv_state === 'ready' ||
      this.mpv_state === 'playing' ||
      this.mpv_state === 'paused'
    );
  }

  /** True while MPV is spawning or loading a file — commands should be blocked. */
  get isBusy(): boolean {
    return this.mpv_state === 'starting' || this.mpv_state === 'loading';
  }

  get is_playing(): boolean {
    return this.mpv_state === 'playing';
  }

  // ── Setters ──────────────────────────────────────────────────────────────

  setMpvState(s: MpvLifecycle) {
    this.mpv_state = s;
  }

  setZoomMode(mode: 'fit-entire' | 'fit-episode' | 'manual') {
    this.zoom_mode = mode;
  }

  setZoomFactor(factor: number) {
    this.zoom_mode = 'manual';
    this.zoom_factor = Math.max(0.001, Math.min(factor, 100.0));
  }

  setPlayhead(ms: number) {
    this.playhead_ms = Math.max(0, ms);
  }

  togglePlay() {
    if (this.mpv_state === 'playing') {
      this.mpv_state = 'paused';
    } else if (this.mpv_state === 'paused' || this.mpv_state === 'ready') {
      this.mpv_state = 'playing';
    }
    // No-op in any other state
  }

  reset() {
    this.playhead_ms = 0;
    this.mpv_state   = 'not_started';
    this.zoom_mode   = 'manual';
    this.zoom_factor = 1.0;
  }
}

export const playbackStore = new PlaybackStore();
