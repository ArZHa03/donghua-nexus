<script lang="ts">
  import { projectStore } from '../../stores/project_store.svelte';
  import { playbackStore } from '../../stores/playback_store.svelte';
  import { loadingStore } from '../../stores/loading_store.svelte';
  import type { EpisodeSegment } from '../../types';

  // ── Props ─────────────────────────────────────────────────────────────────
  interface Props {
    /**
     * Called ONLY when the user explicitly clicks a segment.
     * Timeline background clicks do NOT trigger this.
     * Parent (+page.svelte) uses this to call selectEpisodeForPreview → mpvLoadFile.
     */
    onSelectSegment: (episodeId: string, segmentId: string) => void;
  }
  let { onSelectSegment }: Props = $props();

  // ── Layout constants ──────────────────────────────────────────────────────
  const BASE_PX_PER_MS = 0.05;

  // ── Episode color palette (Color A — episode group) ───────────────────────
  // Each episode gets a hue from this palette so adjacent episodes are
  // visually distinguishable at a glance.
  const EPISODE_HUES = [
    210, // blue
    160, // teal
    270, // purple
    30,  // amber
    0,   // red
    190, // cyan
    300, // magenta
    90,  // green
  ];

  function episodeHue(episodeId: string): number {
    const idx = projectStore.episodes.findIndex(e => e.id === episodeId);
    return EPISODE_HUES[idx % EPISODE_HUES.length];
  }

  // ── Scroll & resize state ─────────────────────────────────────────────────
  let containerRef: HTMLDivElement | undefined;
  let scrollLeft  = $state(0);
  let clientWidth = $state(1000);

  $effect(() => {
    if (!containerRef) return;
    const ro = new ResizeObserver(entries => {
      clientWidth = entries[0].contentRect.width;
    });
    ro.observe(containerRef);
    return () => ro.disconnect();
  });

  // ── Derived dimensions ────────────────────────────────────────────────────
  // ── Derived dimensions based on zoom mode ─────────────────────────────────
  let scale = $derived.by(() => {
    const totalDuration = projectStore.total_duration_ms;
    const padding = 40;
    const availableWidth = Math.max(100, clientWidth - padding);

    if (playbackStore.zoom_mode === 'fit-entire') {
      return totalDuration > 0 ? (availableWidth / totalDuration) : BASE_PX_PER_MS;
    } else if (playbackStore.zoom_mode === 'fit-episode') {
      const epDur = projectStore.selectedEpisode?.duration_ms;
      if (epDur && epDur > 0) return availableWidth / epDur;
      return totalDuration > 0 ? (availableWidth / totalDuration) : BASE_PX_PER_MS;
    } else {
      return BASE_PX_PER_MS * playbackStore.zoom_factor;
    }
  });

  let timelineWidth = $derived(projectStore.total_duration_ms * scale);
  let playheadPos   = $derived(playbackStore.playhead_ms * scale);

  // ── Virtualization: only render clips visible in the scroll viewport ──────
  let visibleSegments = $derived.by(() => {
    const buffer   = 1200; // px buffer on each side to prevent pop-in
    const viewStart = scrollLeft - buffer;
    const viewEnd   = scrollLeft + clientWidth + buffer;

    return projectStore.activeSegments.filter(seg => {
      const left  = seg.timeline_offset_ms * scale;
      const right = left + (seg.source_end_ms - seg.source_start_ms) * scale;
      return right >= viewStart && left <= viewEnd;
    });
  });

  // ── Segment label helpers ─────────────────────────────────────────────────

  /** Returns the 1-based segment index within its episode (among active segments only). */
  function segmentIndex(seg: EpisodeSegment): number {
    const epSegs = projectStore.segmentsByEpisode.get(seg.episode_id) ?? [];
    return epSegs.findIndex(s => s.id === seg.id) + 1;
  }

  /** Returns the 1-based episode index across all episodes. */
  function episodeIndex(episodeId: string): number {
    return projectStore.episodes.findIndex(e => e.id === episodeId) + 1;
  }

  // ── Time formatting ───────────────────────────────────────────────────────
  function formatTime(ms: number): string {
    const totalSecs = Math.floor(ms / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    const msStr = String(ms % 1000).padStart(3, '0').slice(0, 2);
    return `${m}:${s.toString().padStart(2, '0')}.${msStr}`;
  }

  // ── Ruler tick generation ─────────────────────────────────────────────────
  let rulerTicks = $derived.by(() => {
    if (projectStore.total_duration_ms === 0) return [];
    
    // Choose tick interval based on zoom so ruler stays readable
    const targetTickPx = 120;
    const msPerTick_raw = targetTickPx / scale;
    // Round to a human-friendly interval
    const niceIntervals = [
      100, 500, 1000, 5000, 10000, 30000, 60000, 300000, 600000, 
      1800000, 3600000, 7200000, 14400000, 28800000, 86400000
    ];
    const interval = niceIntervals.find(i => i >= msPerTick_raw) ?? 86400000;

    const ticks: { ms: number; label: string }[] = [];
    for (let ms = 0; ms <= projectStore.total_duration_ms; ms += interval) {
      ticks.push({ ms, label: formatTime(ms) });
    }
    return ticks;
  });

  // ── Event handlers ────────────────────────────────────────────────────────

  function handleWheel(e: WheelEvent) {
    if (e.ctrlKey) {
      e.preventDefault();
      
      let currentZoomFactor = playbackStore.zoom_factor;
      if (playbackStore.zoom_mode !== 'manual') {
        currentZoomFactor = scale / BASE_PX_PER_MS;
      }
      
      const zoomSpeed = 0.08;
      const factor = e.deltaY < 0 ? (1 + zoomSpeed) : (1 - zoomSpeed);
      playbackStore.setZoomFactor(currentZoomFactor * factor);
    }
  }

  function handleScroll(e: Event) {
    scrollLeft = (e.target as HTMLDivElement).scrollLeft;
  }

  /**
   * Timeline BACKGROUND click.
   * Rule: ONLY moves playhead_ms. Never changes selectedEpisodeId/selectedSegmentId.
   */
  function handleTimelineClick(e: MouseEvent) {
    if (!containerRef) return;
    const clickX = e.clientX - containerRef.getBoundingClientRect().left + scrollLeft;
    const ms     = Math.max(0, Math.min(clickX / scale, projectStore.total_duration_ms));
    playbackStore.setPlayhead(ms);
    // ← deliberately NO selection change here
  }

  /**
   * Segment CLIP click.
   * Rule: moves playhead AND triggers episode/segment selection → MPV load.
   */
  function handleSegmentClick(e: MouseEvent, seg: EpisodeSegment) {
    e.stopPropagation(); // Prevent handleTimelineClick from also firing
    if (!containerRef) return;
    const clickX = e.clientX - containerRef.getBoundingClientRect().left + scrollLeft;
    const ms     = Math.max(0, Math.min(clickX / scale, projectStore.total_duration_ms));
    playbackStore.setPlayhead(ms);
    onSelectSegment(seg.episode_id, seg.id);
  }

  async function handleSetZoomMode(mode: 'fit-entire' | 'fit-episode') {
    loadingStore.start("Calculating layout...");
    await new Promise(r => setTimeout(r, 10));
    playbackStore.setZoomMode(mode);
    loadingStore.stop();
  }

  async function handleSetZoomFactor(factor: number) {
    loadingStore.start("Calculating layout...");
    await new Promise(r => setTimeout(r, 10));
    playbackStore.setZoomFactor(factor);
    loadingStore.stop();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="timeline-container"
  onwheel={handleWheel}
  onscroll={handleScroll}
  onclick={handleTimelineClick}
  bind:this={containerRef}
>
  <div class="timeline-scroll" style="width: {Math.max(timelineWidth, clientWidth)}px">

    <!-- ── Ruler ─────────────────────────────────────────────────────────── -->
    <div class="ruler">
      {#each rulerTicks as tick (tick.ms)}
        <div class="ruler-tick" style="left: {tick.ms * scale}px">
          {tick.label}
        </div>
      {/each}
    </div>

    <!-- ── Playhead ──────────────────────────────────────────────────────── -->
    {#if projectStore.total_duration_ms > 0}
      <div class="playhead" style="transform: translateX({playheadPos}px);">
        <div class="playhead-line"></div>
        <div class="playhead-label">{formatTime(playbackStore.playhead_ms)}</div>
      </div>
    {/if}

    <!-- ── Track ─────────────────────────────────────────────────────────── -->
    <div class="track">
      {#each visibleSegments as seg (seg.id)}
        {@const widthPx    = (seg.source_end_ms - seg.source_start_ms) * scale}
        {@const leftPx     = seg.timeline_offset_ms * scale}
        {@const hue        = episodeHue(seg.episode_id)}
        {@const isEpActive = seg.episode_id === projectStore.selectedEpisodeId}
        {@const isSegSel   = seg.id === projectStore.selectedSegmentId}
        {@const epIdx      = episodeIndex(seg.episode_id)}
        {@const segIdx     = segmentIndex(seg)}

        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="segment"
          class:episode-active={isEpActive && !isSegSel}
          class:seg-selected={isSegSel}
          style="
            width: {widthPx}px;
            transform: translateX({leftPx}px);
            --ep-hue: {hue};
          "
          onclick={(e) => handleSegmentClick(e, seg)}
          title="Ep {epIdx} · Seg {segIdx}&#10;{formatTime(seg.source_start_ms)} → {formatTime(seg.source_end_ms)}"
        >
          {#if widthPx > 60}
            <div class="seg-label">Ep {epIdx} · Seg {segIdx}</div>
            {#if widthPx > 120}
              <div class="seg-time">{formatTime(seg.source_start_ms)} → {formatTime(seg.source_end_ms)}</div>
            {/if}
          {/if}
        </div>
      {/each}
    </div>

  </div>
</div>

<!-- Zoom Controls -->
<div class="zoom-controls">
  <button 
    onclick={() => handleSetZoomMode('fit-entire')} 
    class:active={playbackStore.zoom_mode === 'fit-entire'}
  >
    Fit All
  </button>
  <button 
    onclick={() => handleSetZoomMode('fit-episode')} 
    class:active={playbackStore.zoom_mode === 'fit-episode'}
    disabled={!projectStore.selectedEpisodeId}
  >
    Fit Episode
  </button>
  {#each [0.25, 0.5, 1.0, 2.0, 4.0, 8.0, 16.0] as preset}
    <button 
      onclick={() => handleSetZoomFactor(preset)} 
      class:active={playbackStore.zoom_mode === 'manual' && playbackStore.zoom_factor === preset}
    >
      {preset * 100}%
    </button>
  {/each}
</div>

<style>
  .timeline-container {
    height: 100%;
    min-height: 200px;
    background: var(--bg-dark);
    overflow-x: auto;
    overflow-y: hidden;
    position: relative;
    padding-top: 30px; /* Space for ruler */
    cursor: crosshair;
  }

  .timeline-scroll {
    height: 100%;
    position: relative;
    min-width: 100%;
  }

  /* ── Ruler ────────────────────────────────────────────────────────────── */
  .ruler {
    position: absolute;
    top: -30px;
    left: 0;
    right: 0;
    height: 30px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border-color);
    pointer-events: none;
  }

  .ruler-tick {
    position: absolute;
    top: 8px;
    font-size: 0.65em;
    color: var(--text-muted);
    border-left: 1px solid var(--border-color);
    padding-left: 4px;
    white-space: nowrap;
    transform: translateX(0);
  }

  /* ── Track ────────────────────────────────────────────────────────────── */
  .track {
    position: relative;
    height: 80px;
    margin-top: 10px;
    background: var(--timeline-track, #0d1117);
    border-bottom: 1px solid var(--border-color);
  }

  /* ── Segment — base (default, unselected) ─────────────────────────────── */
  .segment {
    position: absolute;
    top: 5px;
    height: 70px;
    /* Use episode hue for a muted default color */
    background: hsl(var(--ep-hue, 210), 35%, 22%);
    border: 1px solid hsl(var(--ep-hue, 210), 45%, 35%);
    border-radius: 4px;
    color: hsl(var(--ep-hue, 210), 60%, 75%);
    font-size: 0.75em;
    padding: 5px 6px;
    overflow: hidden;
    cursor: pointer;
    box-sizing: border-box;
    will-change: transform;
    pointer-events: auto;
    transition: filter 0.1s;
  }

  .segment:hover {
    filter: brightness(1.35);
  }

  /* Color A — episode is selected (all segments of that episode glow blue) */
  .segment.episode-active {
    background: hsl(var(--ep-hue, 210), 65%, 30%);
    border: 1px solid hsl(var(--ep-hue, 210), 80%, 55%);
    color: hsl(var(--ep-hue, 210), 80%, 88%);
    box-shadow: 0 0 0 1px hsl(var(--ep-hue, 210), 80%, 55%) inset;
  }

  /* Color B — THIS specific segment is selected (overrides episode-active) */
  .segment.seg-selected {
    background: #1a4a28;          /* dark green */
    border: 2px solid #3fb950;    /* bright green */
    color: #a8f0b8;
    box-shadow: 0 0 6px rgba(63, 185, 80, 0.4);
  }

  .seg-label {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .seg-time {
    font-size: 0.85em;
    opacity: 0.75;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
  }

  /* ── Playhead ─────────────────────────────────────────────────────────── */
  .playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    z-index: 50;
    pointer-events: none;
    will-change: transform;
  }

  .playhead-line {
    width: 1px;
    height: 100%;
    background: var(--accent-red, #ff5555);
  }

  .playhead-label {
    position: absolute;
    top: -30px;
    left: 4px;
    background: var(--accent-red, #ff5555);
    color: white;
    font-size: 10px;
    padding: 2px 5px;
    border-radius: 2px;
    white-space: nowrap;
  }

  /* ── Zoom controls ────────────────────────────────────────────────────── */
  .zoom-controls {
    position: absolute;
    bottom: 10px;
    right: 10px;
    background: var(--bg-panel);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    display: flex;
    overflow: hidden;
    z-index: 100;
  }

  .zoom-controls button {
    background: transparent;
    color: var(--text-muted);
    border: none;
    padding: 6px 12px;
    font-size: 0.8em;
    cursor: pointer;
    border-right: 1px solid var(--border-color);
  }
  .zoom-controls button:last-child { border-right: none; }
  .zoom-controls button:hover { background: var(--bg-hover); }
  .zoom-controls button.active {
    background: var(--accent-blue);
    color: white;
  }
</style>
