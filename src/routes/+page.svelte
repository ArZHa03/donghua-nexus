<script lang="ts">
  import { onMount } from 'svelte';
  import { listen } from '@tauri-apps/api/event';
  import { open } from '@tauri-apps/plugin-dialog';
  import { projectStore } from '../lib/stores/project_store.svelte';
  import { episodeStore } from '../lib/stores/episode_store.svelte';
  import { segmentStore } from '../lib/stores/segment_store.svelte';
  import { historyStore } from '../lib/stores/history_store.svelte';
  import { processingStore } from '../lib/stores/processing_store.svelte';
  import { playbackStore } from '../lib/stores/playback_store.svelte';
  import { tauriCommands } from '../lib/tauri_commands';
  import { PlaybackService } from '../lib/services/playback_service';
  import DropZone from '../lib/components/import/DropZone.svelte';
  import EpisodeList from '../lib/components/import/EpisodeList.svelte';
  import PreviewPlayer from '../lib/components/preview/PreviewPlayer.svelte';
  import Timeline from '../lib/components/timeline/Timeline.svelte';

  let selectedPanel = $state('subtitle');

  const playbackService = new PlaybackService(
    projectStore,
    playbackStore,
    tauriCommands,
  );

  // ── Import handlers ───────────────────────────────────────────────────────

  async function handleAddFiles() {
    if (processingStore.importing) return;

    const selected = await open({
      multiple: true,
      filters: [{ name: 'Video', extensions: ['mkv', 'mp4'] }]
    });
    if (!Array.isArray(selected) || selected.length === 0) return;

    processingStore.importing = true;
    processingStore.importProgress = 0;
    processingStore.importTotal = selected.length;
    try {
      for (let i = 0; i < selected.length; i++) {
        const metadata = await tauriCommands.importVideos([selected[i]]);
        projectStore.addEpisodes(metadata);
        processingStore.importProgress = i + 1;
      }
    } catch (e) {
      console.error("Import failed:", e);
    } finally {
      processingStore.importing = false;
    }
  }

  async function handleAddFolder() {
    if (processingStore.importing) return;

    const selected = await open({ directory: true });
    if (!selected || typeof selected !== 'string') return;

    processingStore.importing = true;
    try {
      const metadata = await tauriCommands.importFolder(selected);
      projectStore.addEpisodes(metadata);
    } catch (e) {
      console.error("Folder import failed:", e);
    } finally {
      processingStore.importing = false;
    }
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  async function runHeavyAction(label: string, action: () => void) {
    processingStore.processingLabel = label;
    processingStore.isProcessing = true;
    await new Promise(resolve => setTimeout(resolve, 30));
    try {
      action();
    } finally {
      processingStore.isProcessing = false;
      processingStore.processingLabel = '';
    }
  }

  async function handleGlobalKeydown(e: KeyboardEvent) {
    if (processingStore.isProcessing) {
      e.preventDefault();
      return;
    }
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (episodeStore.episodes.length === 0) return;

    switch (true) {
      case e.key === ' ' && !e.ctrlKey:
        e.preventDefault();
        await playbackService.togglePause();
        break;
      case e.key === 'ArrowLeft':
        e.preventDefault();
        await playbackService.stepFrame('backward');
        break;
      case e.key === 'ArrowRight':
        e.preventDefault();
        await playbackService.stepFrame('forward');
        break;
      case e.key.toLowerCase() === 'b' && e.ctrlKey:
        e.preventDefault();
        runHeavyAction('Splitting Segment...', () => {
          segmentStore.splitSegment(playbackStore.playhead_ms);
        });
        break;
      case e.key.toLowerCase() === 'q' && !e.ctrlKey:
        e.preventDefault();
        runHeavyAction('Trimming Left...', () => {
          segmentStore.deleteLeft(playbackStore.playhead_ms);
        });
        break;
      case e.key.toLowerCase() === 'w' && !e.ctrlKey:
        e.preventDefault();
        runHeavyAction('Trimming Right...', () => {
          segmentStore.deleteRight(playbackStore.playhead_ms);
        });
        break;
      case e.key === 'Delete':
        e.preventDefault();
        runHeavyAction('Deleting Segment...', () => {
          const targetSeg = segmentStore.activeSegments.find(s =>
            playbackStore.playhead_ms >= s.timeline_offset_ms &&
            playbackStore.playhead_ms < s.timeline_offset_ms + (s.source_end_ms - s.source_start_ms)
          );
          if (targetSeg) segmentStore.softDeleteSegment(targetSeg.id);
        });
        break;
      case e.key.toLowerCase() === 'z' && e.ctrlKey:
        e.preventDefault();
        runHeavyAction('Undoing...', () => historyStore.smartUndo());
        break;
      case e.key.toLowerCase() === 'y' && e.ctrlKey:
        e.preventDefault();
        runHeavyAction('Redoing...', () => historyStore.smartRedo());
        break;
    }
  }

  // ── Realtime MPV event listener ───────────────────────────────────────────

  onMount(() => {
    let unlisten: (() => void) | null = null;
    listen<Record<string, unknown>>('mpv-event', (event) => {
      const payload = event.payload;
      playbackStore.handleMpvEvent(payload);
      if (payload.event === 'file-loaded') {
        playbackService.notifyFileLoaded();
      } else if (payload.event === 'listener-error') {
        const errMsg = (payload as any).error ?? 'unknown';
        const listenerId = (payload as any).listener_id ?? '?';
        console.error('[LIFECYCLE] +page.svelte received listener#' + listenerId + ' error:', errMsg);
        console.error('[LIFECYCLE]   notifying playbackService of error');
        playbackService.notifyError();
      }
    }).then(fn => { unlisten = fn; });
    return () => {
      playbackService.cancelDebounce();
      unlisten?.();
    };
  });

  // ── Unload MPV when all episodes are removed ──────────────────────────────

  $effect(() => {
    if (episodeStore.episodes.length === 0) {
      playbackService.unloadIfEmpty(0);
    }
  });
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<svelte:head>
  <title>Donghua Nexus</title>
</svelte:head>

<DropZone />

{#if processingStore.isProcessing}
  <div class="processing-overlay">
    <div class="processing-card">
      <div class="spinner"></div>
      <div class="processing-label">{processingStore.processingLabel}</div>
      <div class="processing-sub">Please Wait</div>
    </div>
  </div>
{/if}

<div class="editor-layout">
  {#if episodeStore.episodes.length === 0}
    <div class="welcome-screen">
      <div class="welcome-content">
        <h1>Donghua Nexus</h1>
        <p class="subtitle">Offline-first high-performance video editor</p>
        
        <div class="features-grid">
          <div class="feature">✔ MKV / MP4 Support</div>
          <div class="feature">✔ Soft Subtitles (ASS/SRT)</div>
          <div class="feature">✔ Natural Sorting</div>
          <div class="feature">✔ Bulk Processing</div>
        </div>

        <div class="actions">
          <button class="primary" onclick={handleAddFiles}>Browse Files</button>
          <button class="secondary" onclick={handleAddFolder}>Add Folder</button>
        </div>
        <p class="hint">or drag &amp; drop files anywhere</p>
      </div>
    </div>
  {:else}
    <div class="top-section">
      <!-- Left Sidebar: Episode List -->
      <EpisodeList
        onAddFiles={handleAddFiles}
        onAddFolder={handleAddFolder}
        onSelectEpisode={(id) => playbackService.selectEpisodeForPreview(id)}
      />

      <!-- Main Center: Preview -->
      <div class="center-stage">
        <PreviewPlayer />
      </div>

      <!-- Right Sidebar: Properties/Panels -->
      <div class="right-panel">
        <div class="tabs">
          <button class:active={selectedPanel === 'subtitle'} onclick={() => selectedPanel = 'subtitle'}>Subtitle</button>
          <button class:active={selectedPanel === 'watermark'} onclick={() => selectedPanel = 'watermark'}>Watermark</button>
          <button class:active={selectedPanel === 'chapter'} onclick={() => selectedPanel = 'chapter'}>Chapter</button>
          <button class:active={selectedPanel === 'encode'} onclick={() => selectedPanel = 'encode'}>Encode</button>
        </div>
        
        <div class="panel-content">
          {#if selectedPanel === 'subtitle'}
            <h3>Subtitle Tracks</h3>
            {#if episodeStore.selectedEpisode}
              <div class="segment-info">
                <span class="info-label">Episode:</span>
                <span class="info-value">{episodeStore.selectedEpisode.filename}</span>
              </div>
              {#if segmentStore.selectedSegment}
                {@const seg = segmentStore.selectedSegment}
                <div class="segment-info">
                  <span class="info-label">Segment:</span>
                  <span class="info-value">
                    {formatTime(seg.source_start_ms)} → {formatTime(seg.source_end_ms)}
                  </span>
                </div>
              {/if}
              <div class="subtitle-list">
                {#each episodeStore.selectedEpisode.subtitle_tracks as track, i}
                  <div class="track-item">
                    <div class="track-header">
                      <span class="track-num">{i + 1}</span>
                      <span class="track-lang">{track.language || 'Unknown'}</span>
                      {#if track.stream_index !== null && !track.is_external}
                         <span class="track-badge">Internal</span>
                      {/if}
                    </div>
                    <div class="track-details">
                      <div class="detail"><span>Codec:</span> {track.codec.toUpperCase()}</div>
                      <div class="detail"><span>Name:</span> {track.title || 'Untitled'}</div>
                    </div>
                  </div>
                {/each}
                {#if episodeStore.selectedEpisode.subtitle_tracks.length === 0}
                  <p class="muted">No subtitles detected.</p>
                {/if}
              </div>
            {:else}
              <p class="muted">Select an episode to view subtitles.</p>
            {/if}
          {:else if selectedPanel === 'watermark'}
            <h3>Watermark Preview</h3>
            <p class="muted mt-2">Coming in next phases.</p>
          {:else}
            <h3>{selectedPanel}</h3>
            <p class="muted mt-2">Coming in next phases.</p>
          {/if}
        </div>
      </div>
    </div>

    <!-- Bottom Section: Timeline -->
    <div class="bottom-section">
      <Timeline
        onSelectSegment={(episodeId, segmentId) => playbackService.selectEpisodeForPreview(episodeId, segmentId)}
      />
    </div>
  {/if}
</div>

<script lang="ts" module>
  function formatTime(ms: number): string {
    const totalSecs = Math.floor(ms / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
</script>

<style>
  .editor-layout {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    background: var(--bg-main);
  }

  .welcome-screen {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .welcome-content {
    max-width: 600px;
    padding: 40px;
  }

  h1 {
    font-size: 3rem;
    color: var(--accent-blue);
    margin-bottom: 10px;
    letter-spacing: -0.02em;
  }

  .subtitle {
    color: var(--text-muted);
    font-size: 1.2rem;
    margin-bottom: 40px;
  }

  .features-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
    margin-bottom: 40px;
  }

  .feature {
    background: var(--bg-panel);
    padding: 12px;
    border-radius: 8px;
    font-size: 0.9rem;
    color: var(--text-main);
    border: 1px solid var(--border-color);
  }

  .actions {
    display: flex;
    gap: 20px;
    justify-content: center;
    margin-bottom: 20px;
  }

  button.primary {
    background: var(--accent-blue);
    color: white;
    padding: 12px 30px;
    font-size: 1.1rem;
  }

  button.secondary {
    background: transparent;
    border: 1px solid var(--accent-blue);
    color: var(--accent-blue);
    padding: 12px 30px;
    font-size: 1.1rem;
  }

  .hint {
    color: var(--text-muted);
    font-size: 0.9rem;
    margin-top: 20px;
  }

  .top-section {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .center-stage {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: black;
  }

  .right-panel {
    width: 300px;
    background: var(--bg-panel);
    border-left: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid var(--border-color);
  }
  
  .tabs button {
    flex: 1;
    padding: 12px 0;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 2px solid transparent;
    color: var(--text-muted);
  }

  .tabs button.active {
    color: var(--accent-blue);
    border-bottom-color: var(--accent-blue);
    background: rgba(88, 166, 255, 0.05);
  }

  .panel-content {
    padding: 20px;
    flex: 1;
    overflow-y: auto;
  }

  .segment-info {
    display: flex;
    gap: 6px;
    align-items: baseline;
    font-size: 0.78rem;
    margin-bottom: 4px;
  }
  .info-label {
    color: var(--text-muted);
    min-width: 56px;
  }
  .info-value {
    color: var(--text-main);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .subtitle-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 15px;
  }

  .track-item {
    background: var(--bg-dark);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 12px;
  }

  .track-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .track-num {
    background: var(--accent-blue);
    color: white;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.65rem;
    font-weight: bold;
  }

  .track-lang {
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--text-main);
  }

  .track-badge {
    font-size: 0.6rem;
    background: rgba(255, 255, 255, 0.1);
    padding: 1px 5px;
    border-radius: 3px;
  }

  .detail {
    font-size: 0.7rem;
    color: var(--text-muted);
    margin: 2px 0;
  }
  .detail span {
    color: var(--text-dim);
    width: 42px;
    display: inline-block;
  }

  .bottom-section {
    height: 200px;
    border-top: 1px solid var(--border-color);
    background: var(--bg-panel);
  }

  .muted { color: var(--text-muted); font-size: 0.85rem; }
  .mt-2 { margin-top: 8px; }

  /* Processing overlay */
  .processing-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }

  .processing-card {
    background: var(--bg-panel);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 40px 50px;
    text-align: center;
    min-width: 250px;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--border-color);
    border-top-color: var(--accent-blue);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 16px;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .processing-label {
    font-size: 1rem;
    color: var(--text-main);
    font-weight: 500;
  }

  .processing-sub {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-top: 4px;
  }
</style>
