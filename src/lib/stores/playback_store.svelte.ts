/**
 * MPV process lifecycle state.
 *
 * The `loading → ready` transition is now driven by MPV's `file-loaded` event
 * received via the realtime-sync event listener. Playhead position and pause
 * state are also synced from MPV property-change events.
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

  /** Source position offset (ms) of the currently loaded segment. */
  sourceStartMs = $state(0);
  /** Timeline position (ms) of the currently loaded segment. */
  timelineOffsetMs = $state(0);

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

  setSourceStartMs(ms: number) {
    this.sourceStartMs = ms;
  }

  setTimelineOffsetMs(ms: number) {
    this.timelineOffsetMs = ms;
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
    this.sourceStartMs = 0;
    this.timelineOffsetMs = 0;
    this.zoom_mode   = 'manual';
    this.zoom_factor = 1.0;
  }

  /// Process an MPV event received from the realtime event listener.
  /// Called by the Tauri event handler in +page.svelte.
  handleMpvEvent(event: Record<string, unknown>) {
    const eventType = event.event as string | undefined;
    if (!eventType) return;

    console.log('[MPV EVENT]', eventType, event);

    switch (eventType) {
      case 'file-loaded':
        console.log('[LIFECYCLE] file-loaded — MPV finished loading, state -> ready');
        this.mpv_state = 'ready';
        break;

      case 'end-file': {
        const reason = (event as any).reason ?? 'unknown';
        console.log('[LIFECYCLE] end-file — reason:', reason, 'current state:', this.mpv_state);
        if (this.mpv_state !== 'loading' && this.mpv_state !== 'starting') {
          this.mpv_state = 'not_started';
          this.playhead_ms = 0;
        }
        break;
      }

      case 'shutdown':
        console.log('[LIFECYCLE] shutdown — MPV is shutting down (no state change)');
        break;

      case 'property-change': {
        const name = event.name as string | undefined;
        const data = event.data;
        if (!name) break;

        console.log('[MPV PROPERTY]', name, '=', data);

        switch (name) {
          case 'playback-time': {
            const secs = data as number;
            if (typeof secs === 'number') {
              const sourceMs = secs * 1000;
              const elapsedSinceStart = Math.max(0, sourceMs - this.sourceStartMs);
              this.playhead_ms = this.timelineOffsetMs + elapsedSinceStart;
            }
            break;
          }
          case 'pause':
            if (data === true) {
              if (this.mpv_state === 'playing') {
                this.mpv_state = 'paused';
              }
            } else if (data === false) {
              if (this.mpv_state !== 'loading' && this.mpv_state !== 'starting') {
                this.mpv_state = 'playing';
              }
            }
            break;
          case 'eof-reached':
            if (this.mpv_state === 'playing') {
              this.mpv_state = 'paused';
            }
            break;
          case 'seeking':
            break;
        }
        break;
      }

      case 'listener-error': {
        const errMsg = (event as any).error ?? 'unknown';
        const listenerId = (event as any).listener_id ?? '?';
        console.error('[LIFECYCLE] listener#' + listenerId + ' — listener-error:', errMsg);
        console.error('[LIFECYCLE]   setting mpv_state -> error (listener died)');
        this.mpv_state = 'error';
        break;
      }
    }
  }
}

export const playbackStore = new PlaybackStore();
