<script lang="ts">
  import { open } from '@tauri-apps/plugin-dialog';
  import { tauriCommands } from '../../lib/tauri_commands';
  import { projectStore } from '../../lib/stores/project_store.svelte';
  import { episodeStore } from '../../lib/stores/episode_store.svelte';
  import { segmentStore } from '../../lib/stores/segment_store.svelte';
  import { playbackStore } from '../../lib/stores/playback_store.svelte';
  import Timeline from '../../lib/components/timeline/Timeline.svelte';

  // ── Benchmark results ─────────────────────────────────────────────────────
  interface BenchmarkResult {
    metric: string;
    value: string;
    raw: number;
    status: 'pass' | 'warn' | 'fail' | 'pending';
  }

  const THRESHOLDS: Record<string, { pass: number; warn: number; unit: string; higherIsBetter: boolean }> = {
    'Import Time (s)':         { pass: 30,  warn: 60,  unit: 's',   higherIsBetter: false },
    'Timeline Render (ms)':    { pass: 500, warn: 1000, unit: 'ms', higherIsBetter: false },
    'Scroll FPS':              { pass: 55,  warn: 45,  unit: 'fps', higherIsBetter: true  },
    'Zoom FPS':                { pass: 55,  warn: 45,  unit: 'fps', higherIsBetter: true  },
    'Memory — JS Heap (MB)':   { pass: 150, warn: 300, unit: 'MB',  higherIsBetter: false },
  };

  function evalStatus(key: string, raw: number): 'pass' | 'warn' | 'fail' {
    const t = THRESHOLDS[key];
    if (!t) return 'pass';
    if (t.higherIsBetter) {
      if (raw >= t.pass) return 'pass';
      if (raw >= t.warn) return 'warn';
      return 'fail';
    } else {
      if (raw <= t.pass) return 'pass';
      if (raw <= t.warn) return 'warn';
      return 'fail';
    }
  }

  let results = $state<BenchmarkResult[]>([]);
  let running  = $state(false);
  let folderPath = $state<string | null>(null);
  let episodeCount = $state(0);
  let log = $state<string[]>([]);

  function addLog(msg: string) {
    log = [...log, `[${new Date().toLocaleTimeString()}] ${msg}`];
  }

  function pushResult(metric: string, raw: number, unit: string) {
    const status = evalStatus(metric, raw);
    const existing = results.findIndex(r => r.metric === metric);
    const entry: BenchmarkResult = {
      metric,
      value: `${raw.toFixed(unit === 'ms' || unit === 's' ? 1 : 0)} ${unit}`,
      raw,
      status,
    };
    if (existing >= 0) {
      results[existing] = entry;
    } else {
      results = [...results, entry];
    }
  }

  // ── Step 1: Select folder ─────────────────────────────────────────────────
  async function handleSelectFolder() {
    const selected = await open({ directory: true });
    if (selected && typeof selected === 'string') {
      folderPath = selected;
      addLog(`Folder selected: ${selected}`);
    }
  }

  // ── Step 2: Run full benchmark ────────────────────────────────────────────
  async function runBenchmark() {
    if (!folderPath) { addLog('ERROR: No folder selected.'); return; }

    running = true;
    results = [];
    log = [];
    projectStore.clear();
    playbackStore.reset();
    addLog('Benchmark started…');

    // ── Phase 1: Real Import ──────────────────────────────────────────────
    addLog('Phase 1: Importing files…');
    const t0Import = performance.now();
    try {
      const metadata = await tauriCommands.importFolder(folderPath);
      projectStore.addEpisodes(metadata);
      episodeCount = episodeStore.episodes.length;
    } catch (err) {
      addLog(`Import ERROR: ${err}`);
      running = false;
      return;
    }
    const importSec = (performance.now() - t0Import) / 1000;
    pushResult('Import Time (s)', importSec, 's');
    addLog(`Import done: ${episodeCount} episodes in ${importSec.toFixed(1)}s`);

    // ── Phase 2: Initial Timeline Render ──────────────────────────────────
    addLog('Phase 2: Measuring initial render…');
    const t0Render = performance.now();
    // Wait two animation frames for DOM to fully paint
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const renderMs = performance.now() - t0Render;
    pushResult('Timeline Render (ms)', renderMs, 'ms');
    addLog(`Render time: ${renderMs.toFixed(1)}ms`);

    // ── Phase 3: Scroll FPS ───────────────────────────────────────────────
    addLog('Phase 3: Scroll FPS (3 sec)…');
    const scrollFps = await measureScrollFps(3000);
    pushResult('Scroll FPS', scrollFps, 'fps');
    addLog(`Scroll FPS: ${scrollFps.toFixed(0)}`);

    // ── Phase 4: Zoom FPS ─────────────────────────────────────────────────
    addLog('Phase 4: Zoom FPS (2 sec)…');
    const zoomFps = await measureZoomFps(2000);
    pushResult('Zoom FPS', zoomFps, 'fps');
    addLog(`Zoom FPS: ${zoomFps.toFixed(0)}`);

    // ── Phase 5: Memory ───────────────────────────────────────────────────
    addLog('Phase 5: Memory snapshot…');
    const memMb = getHeapMb();
    pushResult('Memory — JS Heap (MB)', memMb, 'MB');
    addLog(`JS Heap: ${memMb.toFixed(1)} MB`);

    addLog('Benchmark complete.');
    running = false;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  async function measureScrollFps(durationMs: number): Promise<number> {
    return new Promise(resolve => {
      let frames = 0;
      let scrollX = 0;
      let dir = 1;
      const container = document.querySelector('.timeline-container') as HTMLElement | null;
      const start = performance.now();

      function tick() {
        if (performance.now() - start >= durationMs) {
          resolve(frames / (durationMs / 1000));
          return;
        }
        frames++;
        if (container) {
          scrollX += dir * 80;
          if (scrollX > 3000) dir = -1;
          if (scrollX < 0)    dir = 1;
          container.scrollLeft = scrollX;
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  async function measureZoomFps(durationMs: number): Promise<number> {
    return new Promise(resolve => {
      let frames = 0;
      const start = performance.now();
      const zoomPresets = [0.25, 0.5, 1.0, 2.0, 4.0];

      function tick() {
        if (performance.now() - start >= durationMs) {
          resolve(frames / (durationMs / 1000));
          return;
        }
        frames++;
        // Alternate zoom levels rapidly
        const idx = Math.round(performance.now() / 200) % zoomPresets.length;
        playbackStore.setZoomFactor(zoomPresets[idx]);
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  function getHeapMb(): number {
    // @ts-ignore — performance.memory is Chrome/Chromium-only (Tauri WebView)
    const mem = (performance as any).memory;
    if (!mem) return -1;
    return mem.usedJSHeapSize / (1024 * 1024);
  }

  // ── Icon helpers ──────────────────────────────────────────────────────────
  const statusIcon: Record<string, string> = {
    pass:    '✅',
    warn:    '⚠️',
    fail:    '❌',
    pending: '⏳',
  };
</script>

<svelte:head>
  <title>Benchmark — Donghua Nexus</title>
</svelte:head>

<div class="benchmark-page">
  <header class="bench-header">
    <h1>⚡ Real-File Benchmark</h1>
    <p class="sub">Import real Donghua/Anime files and measure Timeline performance at scale.</p>
  </header>

  <!-- Controls -->
  <div class="controls">
    <button class="btn-secondary" onclick={handleSelectFolder} disabled={running}>
      📁 Select Folder
    </button>
    {#if folderPath}
      <span class="folder-path">{folderPath}</span>
    {/if}
    <button class="btn-primary" onclick={runBenchmark} disabled={running || !folderPath}>
      {running ? '⏳ Running…' : '▶ Run Benchmark'}
    </button>
  </div>

  <!-- Results Table -->
  {#if results.length > 0}
    <div class="results-section">
      <h2>Results — {episodeCount} episodes</h2>
      <table class="results-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Result</th>
            <th>Pass</th>
            <th>Warn</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {#each results as r (r.metric)}
            {@const t = THRESHOLDS[r.metric]}
            <tr class="row-{r.status}">
              <td class="metric-name">{r.metric}</td>
              <td class="metric-value">{r.value}</td>
              <td class="threshold">{t ? `${t.higherIsBetter ? '≥' : '≤'} ${t.pass} ${t.unit}` : '—'}</td>
              <td class="threshold">{t ? `${t.higherIsBetter ? '≥' : '≤'} ${t.warn} ${t.unit}` : '—'}</td>
              <td class="status-cell">{statusIcon[r.status]} {r.status.toUpperCase()}</td>
            </tr>
          {/each}
        </tbody>
      </table>

      <!-- Overall verdict -->
      {#if !running}
        {@const hasFail = results.some(r => r.status === 'fail')}
        {@const hasWarn = results.some(r => r.status === 'warn')}
        <div class="verdict {hasFail ? 'verdict-fail' : hasWarn ? 'verdict-warn' : 'verdict-pass'}">
          {hasFail ? '❌ FAIL — Performance budget exceeded. Prepare migration to virtualized/canvas timeline.' :
           hasWarn ? '⚠️ WARN — Within limits but approaching threshold. Monitor closely.' :
                     '✅ PASS — DOM + visibility culling is sufficient for this dataset.'}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Live Timeline Preview -->
  {#if episodeStore.episodes.length > 0}
    <div class="timeline-preview">
      <h2>Timeline Preview ({segmentStore.activeSegments.length} segments)</h2>
      <div class="timeline-wrap">
        <Timeline onSelectSegment={() => {}} />
      </div>
    </div>
  {/if}

  <!-- Log -->
  {#if log.length > 0}
    <div class="log-section">
      <h3>Log</h3>
      <div class="log-box">
        {#each log as line}
          <div>{line}</div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .benchmark-page {
    min-height: 100vh;
    background: var(--bg-main, #0d1117);
    color: var(--text-main, #e6edf3);
    font-family: var(--font-mono, monospace);
    padding: 32px 40px;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .bench-header h1 {
    font-size: 1.8rem;
    margin: 0 0 6px;
    color: var(--accent-blue, #58a6ff);
  }

  .sub {
    color: var(--text-muted, #8b949e);
    font-size: 0.9rem;
    margin: 0;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .folder-path {
    font-size: 0.8rem;
    color: var(--text-muted, #8b949e);
    background: var(--bg-panel, #161b22);
    padding: 6px 12px;
    border-radius: 4px;
    border: 1px solid var(--border-color, #30363d);
    max-width: 400px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btn-primary, .btn-secondary {
    padding: 8px 18px;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .btn-primary {
    background: var(--accent-blue, #1f6feb);
    color: white;
    border: none;
  }

  .btn-secondary {
    background: transparent;
    border: 1px solid var(--border-color, #30363d);
    color: var(--text-main, #e6edf3);
  }

  .btn-primary:disabled, .btn-secondary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Results table */
  .results-section h2 {
    font-size: 1rem;
    margin: 0 0 12px;
  }

  .results-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .results-table th {
    text-align: left;
    padding: 8px 12px;
    background: var(--bg-panel, #161b22);
    border-bottom: 2px solid var(--border-color, #30363d);
    color: var(--text-muted, #8b949e);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .results-table td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border-color, #30363d);
  }

  .metric-name { font-weight: 600; }
  .metric-value { font-size: 1rem; font-weight: 700; color: #e6edf3; }
  .threshold { color: var(--text-muted, #8b949e); font-size: 0.78rem; }
  .status-cell { font-weight: 700; }

  .row-pass  { background: rgba(46, 160, 67, 0.06); }
  .row-warn  { background: rgba(210, 153, 34, 0.08); }
  .row-fail  { background: rgba(248, 81, 73, 0.08); }

  .verdict {
    margin-top: 16px;
    padding: 14px 18px;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .verdict-pass { background: rgba(46, 160, 67, 0.15); border: 1px solid #2ea043; color: #56d364; }
  .verdict-warn { background: rgba(210, 153, 34, 0.15); border: 1px solid #d29922; color: #e3b341; }
  .verdict-fail { background: rgba(248, 81, 73, 0.15); border: 1px solid #f85149; color: #ff7b72; }

  /* Timeline preview */
  .timeline-preview h2 { font-size: 1rem; margin: 0 0 12px; }

  .timeline-wrap {
    height: 260px;
    position: relative;
    border: 1px solid var(--border-color, #30363d);
    border-radius: 6px;
    overflow: hidden;
  }

  /* Log */
  .log-section h3 {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted, #8b949e);
    margin: 0 0 8px;
  }

  .log-box {
    background: #010409;
    border: 1px solid var(--border-color, #30363d);
    border-radius: 4px;
    padding: 12px 16px;
    font-size: 0.8rem;
    line-height: 1.7;
    max-height: 220px;
    overflow-y: auto;
    color: #56d364;
    font-family: monospace;
  }
</style>
