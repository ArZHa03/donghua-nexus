<script>
  import '../app.css';
  import LoadingOverlay from '$lib/components/shared/LoadingOverlay.svelte';
  let { children } = $props();
</script>

<div class="app-layout">
  {@render children()}
</div>
<LoadingOverlay />

<style>
  .app-layout {
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }
</style>
