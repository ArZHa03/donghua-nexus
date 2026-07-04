<script lang="ts">
  import { projectStore } from '../../stores/project_store.svelte';
  import { playbackStore } from '../../stores/playback_store.svelte';
  import { tauriCommands } from '../../tauri_commands';

  interface Props {
    onAddFiles: () => void;
    onAddFolder: () => void;
    /**
     * Called when the user clicks an episode.
     * Routes through +page.svelte → selectEpisodeForPreview → mpvLoadFile.
     * Do NOT call projectStore.selectedEpisodeId directly here.
     */
    onSelectEpisode: (id: string) => void;
  }

  let { onAddFiles, onAddFolder, onSelectEpisode }: Props = $props();

  function formatDuration(ms: number): string {
    const totalSecs = Math.floor(ms / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  
  function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) {
      return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async function handleClearProject() {
    if (window.confirm("Clear all episodes and project state? This action cannot be undone.")) {
      // Unload MPV file before clearing so the preview returns to placeholder.
      if (playbackStore.isReady) {
        await tauriCommands.mpvUnload().catch(() => {});
      }
      projectStore.clear();
      playbackStore.reset();
    }
  }

  function handleRemoveEpisode(id: string) {
    projectStore.removeEpisode(id);
  }
</script>

<div class="episode-list">
  <div class="header">
    <div class="header-top">
      <h3>Episodes ({projectStore.episodes.length})</h3>
      <button class="clear-btn" onclick={handleClearProject}>Clear Project</button>
    </div>
    <div class="totals-row">
      <span class="total-badge" title="Total Duration">⏱ {formatDuration(projectStore.total_duration_ms)}</span>
      <span class="total-badge" title="Total File Size">💾 {formatSize(projectStore.total_file_size_bytes)}</span>
    </div>
    <div class="toolbar">
      <button class="tool-btn" onclick={onAddFiles}>+ Add Files</button>
      <button class="tool-btn" onclick={onAddFolder}>+ Add Folder</button>
    </div>
  </div>
  
  <div class="list">
    {#each projectStore.episodes as ep}
      <div 
        class="episode-item {projectStore.selectedEpisodeId === ep.id ? 'selected' : ''}" 
        title={ep.path}
        onclick={() => onSelectEpisode(ep.id)}
        role="button"
        tabindex="0"
        onkeydown={(e) => e.key === 'Enter' && onSelectEpisode(ep.id)}
      >
        <div class="item-header">
          <div class="title">{ep.filename}</div>
          <button class="remove-btn" onclick={(e) => { e.stopPropagation(); handleRemoveEpisode(ep.id); }} title="Remove Episode">✕</button>
        </div>
        
        <div class="metadata-grid">
          <div class="meta-tag">
             <span>{formatDuration(ep.duration_ms)}</span>
          </div>
          <div class="meta-tag">
             <span>{ep.width}x{ep.height}</span>
          </div>
          <div class="meta-tag">
             <span>{ep.fps.toFixed(2)} fps</span>
          </div>
          <div class="meta-tag blue">
             <span>{ep.video_codec.toUpperCase()}</span>
          </div>
          <div class="meta-tag green">
             <span>{ep.audio_codec.toUpperCase()}</span>
          </div>
          {#if ep.subtitle_tracks.length > 0}
            <div class="meta-tag orange">
               <span>{ep.subtitle_tracks.length} Subs</span>
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .episode-list {
    width: 320px;
    background: var(--bg-panel);
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  
  .header {
    padding: 15px;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-dark);
  }
  
  .header-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .clear-btn {
    font-size: 0.7rem;
    padding: 4px 8px;
    background: transparent;
    border: 1px solid var(--border-color);
    color: var(--text-muted);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .clear-btn:hover {
    background: rgba(248, 81, 73, 0.1);
    color: #f85149;
    border-color: #f85149;
  }
  
  h3 {
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin: 0;
  }

  .totals-row {
    display: flex;
    gap: 10px;
    margin-bottom: 12px;
  }

  .toolbar {
    display: flex;
    gap: 8px;
  }

  .tool-btn {
    flex: 1;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 6px 0;
    background: var(--bg-hover);
    border: 1px solid var(--border-color);
    color: var(--text-main);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .tool-btn:hover {
    background: var(--accent-blue);
    border-color: var(--accent-blue);
    color: white;
  }

  .total-badge {
    font-size: 0.75rem;
    background: var(--bg-hover);
    padding: 3px 8px;
    border-radius: 4px;
    color: var(--text-main);
  }
  
  .list {
    flex: 1;
    overflow-y: auto;
  }
  
  .episode-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 12px 15px;
    border-bottom: 1px solid var(--border-color);
    transition: background 0.15s;
    background: transparent;
    cursor: pointer;
    border-left: 3px solid transparent;
  }
  
  .episode-item:hover {
    background: var(--bg-hover);
  }

  .episode-item.selected {
    background: rgba(88, 166, 255, 0.08);
    border-left-color: var(--accent-blue);
  }

  .item-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 8px;
  }
  
  .title {
    font-size: 0.85rem;
    font-weight: 500;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  .remove-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 2px 5px;
    font-size: 0.8rem;
    border-radius: 3px;
    transition: all 0.2s;
    line-height: 1;
  }

  .remove-btn:hover {
    background: rgba(248, 81, 73, 0.2);
    color: #f85149;
  }
  
  .metadata-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .meta-tag {
    font-size: 0.65rem;
    padding: 2px 6px;
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-muted);
    border-radius: 3px;
    font-weight: 600;
  }

  .meta-tag.blue { background: rgba(56, 139, 253, 0.15); color: #79c0ff; }
  .meta-tag.green { background: rgba(46, 160, 67, 0.15); color: #56d364; }
  .meta-tag.orange { background: rgba(219, 109, 40, 0.15); color: #ffa657; }
</style>
