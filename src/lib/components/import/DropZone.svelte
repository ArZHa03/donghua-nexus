<script lang="ts">
  import { open } from '@tauri-apps/plugin-dialog';
  import { listen } from '@tauri-apps/api/event';
  import { onMount } from 'svelte';
  import { tauriCommands } from '../../tauri_commands';
  import { projectStore } from '../../stores/project_store.svelte';
  import { episodeStore } from '../../stores/episode_store.svelte';
  import { processingStore } from '../../stores/processing_store.svelte';

  let importing = $state(false);
  let isDragging = $state(false);

  onMount(() => {
    // Prevent default browser drop actions
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("drop", (e) => e.preventDefault());

    // Tauri v2 listeners
    const unlistenDrop = listen<{paths: string[]}>('tauri://drag-drop', (event) => {
      console.log("drop received", event);
      isDragging = false;
      
      const payload = event.payload as any;
      const paths = payload.paths || (Array.isArray(payload) ? payload : []);
      
      console.log("file paths count:", paths.length);
      
      if (Array.isArray(paths) && paths.length > 0) {
        processFiles(paths);
      }
    });

    const unlistenHover = listen('tauri://drag-enter', (event) => {
      console.log("drag enter", event);
      isDragging = true;
    });
    
    const unlistenLeave = listen('tauri://drag-leave', (event) => {
      console.log("drag leave", event);
      // Only set to false if we are actually at the edge or specific condition
      // But in Tauri, drag-leave is most reliable for overlay
      isDragging = false;
    });

    return () => {
      unlistenDrop.then(f => f());
      unlistenHover.then(f => f());
      unlistenLeave.then(f => f());
    };
  });

  async function processFiles(paths: string[]) {
    if (processingStore.importing) return;

    const validExtensions = ['.mkv', '.mp4'];
    const supportedPaths = paths.filter(p => 
      validExtensions.some(ext => p.toLowerCase().endsWith(ext))
    );
    
    const newPaths = supportedPaths.filter(p => !episodeStore.episodes.some(e => e.path === p));
    if (newPaths.length === 0) return;

    processingStore.importing = true;
    processingStore.importProgress = 0;
    processingStore.importTotal = newPaths.length;

    try {
      for (let i = 0; i < newPaths.length; i++) {
          const metadataList = await tauriCommands.importVideos([newPaths[i]]);
          if (metadataList && metadataList.length > 0) {
              projectStore.addEpisodes(metadataList);
          }
          processingStore.importProgress = i + 1;
      }
    } catch (e) {
      console.error("Import failed:", e);
    } finally {
      processingStore.importing = false;
    }
  }

  async function handleSelectFiles() {
    try {
      const selected = await open({
        multiple: true,
        filters: [{
          name: 'Video',
          extensions: ['mkv', 'mp4']
        }]
      });

      if (Array.isArray(selected) && selected.length > 0) {
        processFiles(selected);
      }
    } catch (e) {
      console.error("Failed to import videos:", e);
    }
  }
</script>

<!-- Global Overlay: Only shows when dragging or importing -->
<div class="drop-zone-overlay {processingStore.importing ? 'active importing' : ''} {isDragging ? 'active dragging' : ''}">
  {#if processingStore.importing}
    <div class="loader">
      <div class="loader-text">Importing... {processingStore.importProgress} / {processingStore.importTotal}</div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: {(processingStore.importProgress / processingStore.importTotal) * 100}%"></div>
      </div>
    </div>
  {:else if isDragging}
    <div class="drop-content">
      <h3 class="glow">Drop to Import</h3>
      <p>Only MKV and MP4 files will be accepted</p>
    </div>
  {/if}
</div>

<style>
  .drop-zone-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(13, 17, 23, 0.85);
    backdrop-filter: blur(4px);
    z-index: 9999;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
    border: 4px dashed transparent;
  }

  .drop-zone-overlay.active {
    opacity: 1;
    pointer-events: auto;
  }

  .drop-zone-overlay.dragging {
    border-color: var(--accent-blue);
  }
  
  .drop-content {
    text-align: center;
    pointer-events: none;
  }
  
  h3 {
    margin-bottom: 8px;
    color: var(--accent-blue);
    font-size: 2rem;
    transition: text-shadow 0.2s;
  }

  h3.glow {
    text-shadow: 0 0 20px rgba(88, 166, 255, 0.5);
  }
  
  p {
    color: var(--text-muted);
    font-size: 1.1rem;
  }
  
  button {
    background: var(--accent-blue);
    color: white;
    padding: 10px 20px;
    border-radius: 6px;
    font-weight: bold;
    transition: background 0.2s;
    pointer-events: auto;
    margin-top: 20px;
  }
  
  button:hover {
    background: var(--accent-blue-hover);
  }
  
  .loader {
    width: 60%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .loader-text {
    color: var(--text-muted);
    font-size: 1.1rem;
    font-weight: 500;
  }

  .progress-bar {
    width: 100%;
    height: 6px;
    background: var(--bg-hover);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent-blue);
    transition: width 0.3s ease;
  }

  @keyframes pulse {
    0% { opacity: 0.5; }
    50% { opacity: 1; }
    100% { opacity: 0.5; }
  }
</style>
