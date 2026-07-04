<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { tauriCommands } from '../../tauri_commands';
  import { playbackStore } from '../../stores/playback_store.svelte';

  // ── MPV window bounds sync ────────────────────────────────────────────────
  // ResizeObserver tracks the DOM container so the native MPV window
  // stays perfectly aligned with the preview panel as the layout changes.

  let videoContainer: HTMLDivElement | undefined = $state();
  let resizeObserver: ResizeObserver | undefined;

  onMount(() => {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === videoContainer && playbackStore.isReady) {
          const rect = videoContainer!.getBoundingClientRect();
          tauriCommands.updateMpvBounds(rect.x, rect.y, rect.width, rect.height)
            .catch(err => console.error('Failed to update MPV bounds:', err));
        }
      }
    });
    if (videoContainer) resizeObserver.observe(videoContainer);
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
  });

  // ── Transport controls ────────────────────────────────────────────────────

  async function handleTogglePlay() {
    if (!playbackStore.isReady) return;
    try {
      await tauriCommands.mpvTogglePause();
      playbackStore.togglePlay();
    } catch (err) {
      console.error('MPV toggle pause failed:', err);
      playbackStore.setMpvState('error');
    }
  }

  async function handleFrame(dir: 'forward' | 'backward') {
    if (!playbackStore.isReady) return;
    try {
      await tauriCommands.mpvFrameStep(dir);
    } catch (err) {
      console.error('MPV frame step failed:', err);
      playbackStore.setMpvState('error');
    }
  }
</script>

<div class="player-container">
  <!-- ── Video viewport ──────────────────────────────────────────────────── -->
  <div class="video-viewport" bind:this={videoContainer}>

    {#if playbackStore.mpv_state === 'not_started'}
      <!-- No episode loaded yet -->
      <div class="placeholder">
        <div class="placeholder-icon">▶</div>
        <p>Select an episode to begin preview</p>
      </div>

    {:else if playbackStore.mpv_state === 'starting'}
      <!-- MPV process is spawning -->
      <div class="placeholder">
        <div class="spinner"></div>
        <p>Starting preview…</p>
      </div>

    {:else if playbackStore.mpv_state === 'loading'}
      <!-- MPV visible behind; show subtle loading bar -->
      <div class="loading-bar-container">
        <div class="loading-bar"></div>
      </div>

    {:else if playbackStore.mpv_state === 'error'}
      <!-- Pipe failure or spawn error -->
      <div class="placeholder error">
        <div class="placeholder-icon">⚠</div>
        <p>Preview failed. Select an episode to retry.</p>
      </div>

    {:else}
      <!-- ready / playing / paused: MPV native window is visible. Nothing to overlay. -->
    {/if}

  </div>

  <!-- ── Transport controls ─────────────────────────────────────────────── -->
  <div class="controls">
    <button
      onclick={() => handleFrame('backward')}
      disabled={!playbackStore.isReady}
      title="Step backward one frame (←)"
    >⏮ Frame</button>

    <button
      class="btn-play"
      onclick={handleTogglePlay}
      disabled={!playbackStore.isReady}
      title="Play / Pause (Space)"
    >
      {playbackStore.is_playing ? '⏸ Pause' : '▶ Play'}
    </button>

    <button
      onclick={() => handleFrame('forward')}
      disabled={!playbackStore.isReady}
      title="Step forward one frame (→)"
    >Frame ⏭</button>
  </div>
</div>

<style>
  .player-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px;
    background: var(--bg-darker);
    gap: 16px;
  }

  /* ── Video viewport ───────────────────────────────────────────────────── */
  .video-viewport {
    flex: 1;
    background: #000;
    border-radius: 8px;
    position: relative;
    overflow: hidden;
    min-height: 0;
  }

  /* ── Placeholder (not_started / error) ───────────────────────────────── */
  .placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    gap: 12px;
  }

  .placeholder.error {
    color: var(--accent-red, #ef4444);
  }

  .placeholder-icon {
    font-size: 2.5rem;
    opacity: 0.4;
  }

  .placeholder p {
    font-size: 0.9rem;
    text-align: center;
    max-width: 220px;
    line-height: 1.5;
  }

  /* ── Spinner (starting) ──────────────────────────────────────────────── */
  .spinner {
    width: 36px;
    height: 36px;
    border: 3px solid rgba(255, 255, 255, 0.15);
    border-top-color: var(--accent-blue, #3b82f6);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Loading bar (loading state) ─────────────────────────────────────── */
  .loading-bar-container {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .loading-bar {
    height: 100%;
    width: 40%;
    background: var(--accent-blue, #3b82f6);
    border-radius: 2px;
    animation: slide 1.2s ease-in-out infinite;
  }

  @keyframes slide {
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
  }

  /* ── Transport controls ──────────────────────────────────────────────── */
  .controls {
    display: flex;
    justify-content: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .controls button {
    padding: 8px 18px;
    background: var(--bg-panel);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: 0.875rem;
    cursor: pointer;
    color: var(--text-main);
    transition: background 0.15s, opacity 0.15s;
  }

  .controls button:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .controls button:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .btn-play {
    background: var(--accent-blue, #3b82f6) !important;
    color: #fff;
    font-weight: 600;
    min-width: 96px;
  }

  .btn-play:hover:not(:disabled) {
    background: var(--accent-blue-hover, #2563eb) !important;
  }
</style>
