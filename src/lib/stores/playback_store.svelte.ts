class PlaybackStore {
  playhead_ms = $state(0);
  is_playing = $state(false);
  mpv_started = $state(false); // Global MPV active status
  
  // Timeline Zoom Settings
  zoom_mode = $state<'fit-entire' | 'fit-episode' | 'manual'>('manual');
  zoom_factor = $state(1.0); // manual scale multiplier
  
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
    this.is_playing = !this.is_playing;
  }
  
  setPlaying(playing: boolean) {
    this.is_playing = playing;
  }

  reset() {
    this.playhead_ms = 0;
    this.is_playing = false;
    this.mpv_started = false;
    this.zoom_mode = 'manual';
    this.zoom_factor = 1.0;
  }
}

export const playbackStore = new PlaybackStore();
