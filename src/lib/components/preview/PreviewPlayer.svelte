<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { tauriCommands } from '../../tauri_commands';
  import { playbackStore } from '../../stores/playback_store.svelte';
  import { projectStore } from '../../stores/project_store.svelte';

  // Note: True sync from MPV back to Svelte would require Tauri Events.
  // For M1, we click to play/pause in Svelte and send commands to MPV.
  
  let videoContainer: HTMLDivElement | undefined = $state();
  let resizeObserver: ResizeObserver | undefined;

  onMount(() => {
    resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        if (entry.target === videoContainer && playbackStore.mpv_started) {
          const rect = videoContainer.getBoundingClientRect();
          tauriCommands.updateMpvBounds(rect.x, rect.y, rect.width, rect.height)
            .catch(err => console.error("Failed to update MPV bounds:", err));
        }
      }
    });

    if (videoContainer) {
      resizeObserver.observe(videoContainer);
    }
  });

  onDestroy(() => {
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
  });
  
  async function handleStart() {
    if (!playbackStore.mpv_started) {
      try {
        await tauriCommands.mpvStart();
        playbackStore.mpv_started = true;
        
        // Auto load currently selected episode & segment (or first episode as fallback)
        const activeEp = projectStore.selectedEpisode || projectStore.episodes[0];
        if (activeEp) {
          const segs = projectStore.segmentsByEpisode.get(activeEp.id) ?? [];
          const targetSeg = projectStore.selectedSegment || segs[0];
          const startMs = targetSeg ? targetSeg.source_start_ms : 0;
          await tauriCommands.mpvLoadFile(activeEp.path, startMs / 1000);
        }
        
        // Initial bounds sync
        if (videoContainer) {
          const rect = videoContainer.getBoundingClientRect();
          await tauriCommands.updateMpvBounds(rect.x, rect.y, rect.width, rect.height);
        }
      } catch (err) {
        console.error("Failed to start MPV preview:", err);
        playbackStore.mpv_started = false;
      }
    }
  }

  async function handleTogglePlay() {
    if (!playbackStore.mpv_started) {
      await handleStart();
    }
    if (playbackStore.mpv_started) {
      try {
        await tauriCommands.mpvTogglePause();
        playbackStore.togglePlay();
      } catch (err) {
        console.error("MPV communication error:", err);
        playbackStore.mpv_started = false;
      }
    } else {
      playbackStore.togglePlay();
    }
  }

  async function handleFrame(dir: "forward" | "backward") {
    if (!playbackStore.mpv_started) {
      await handleStart();
    }
    if (playbackStore.mpv_started) {
      try {
        await tauriCommands.mpvFrameStep(dir);
      } catch (err) {
        console.error("MPV communication error:", err);
        playbackStore.mpv_started = false;
      }
    }
  }
</script>

<div class="player-container">
  <div class="video-placeholder" bind:this={videoContainer}>
    {#if !playbackStore.mpv_started}
      <button class="btn-start" onclick={handleStart}>START MPV PREVIEW</button>
      <p class="mt-2 text-sm">MPV will open in a separate window.</p>
    {:else}
      <div class="mpv-active">
        <h3>MPV is Active</h3>
        <p>Previewing current timeline.</p>
      </div>
    {/if}
  </div>

  <div class="controls">
    <button onclick={() => handleFrame("backward")} disabled={!playbackStore.mpv_started}>⏮ Frame</button>
    <button class="btn-play" onclick={handleTogglePlay} disabled={!playbackStore.mpv_started}>
      {playbackStore.is_playing ? 'Pause' : 'Play'}
    </button>
    <button onclick={() => handleFrame("forward")} disabled={!playbackStore.mpv_started}>Frame ⏭</button>
  </div>
</div>

<style>
  .player-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px;
    background: var(--bg-darker);
  }

  .video-placeholder {
    flex: 1;
    background: #000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    margin-bottom: 20px;
    color: var(--text-muted);
  }

  .mt-2 { margin-top: 8px; }
  .text-sm { font-size: 0.85em; }

  .btn-start {
    padding: 10px 20px;
    background: var(--accent-red);
    color: white;
    font-weight: bold;
    border-radius: 4px;
    cursor: pointer;
  }

  .controls {
    display: flex;
    justify-content: center;
    gap: 15px;
  }

  .controls button {
    padding: 8px 16px;
    background: var(--bg-panel);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    transition: background 0.2s;
    cursor: pointer;
    color: var(--text-main);
  }
  
  .controls button:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .controls button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-play {
    background: var(--accent-blue) !important;
    color: white;
    font-weight: bold;
    min-width: 80px;
  }
  .btn-play:hover:not(:disabled) {
    background: var(--accent-blue-hover) !important;
  }
</style>
