<script lang="ts">
  import { loadingStore } from '../../stores/loading_store.svelte';
</script>

{#if loadingStore.is_loading}
  <div class="loading-overlay">
    <div class="spinner"></div>
    <div class="message">{loadingStore.message}</div>
  </div>
{/if}

<style>
  .loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 9999;
    backdrop-filter: blur(4px);
  }

  .spinner {
    width: 50px;
    height: 50px;
    border: 5px solid rgba(255, 255, 255, 0.2);
    border-top-color: var(--accent-blue, #3b82f6);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 20px;
  }

  .message {
    color: white;
    font-size: 1.2rem;
    font-weight: 500;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
