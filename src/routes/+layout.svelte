<script>
  import '../app.css';
  let { children } = $props();
</script>

<div class="app-layout">
  {@render children()}
</div>

<style>
  .app-layout {
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }
</style>
