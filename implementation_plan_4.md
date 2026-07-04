# Implementation Plan — Timeline Foundation v2 (Revised)

This plan incorporates the three architectural revisions approved in the review of `implementation_plan_3.md`.

---

## Summary of Revisions

| # | Revision | Impact |
|---|----------|--------|
| 1 | MPV does **NOT** auto-switch episodes during timeline scrubbing | `+page.svelte`, `Timeline.svelte`, `playback_store` |
| 2 | Data model changed to **Episode → Segments** instead of flat clips | `types/index.ts`, `project_store`, `Timeline.svelte` |
| 3 | DOM + visibility culling kept; benchmark plan documented | `Timeline.svelte`, new `benchmark_notes.md` |

---

## Revision 1 — MPV Preview Isolation

### Problem (old behavior)
The old `$effect` in `+page.svelte` watched `playhead_ms` and auto-computed which episode it fell in,
then called `mpvLoadFile()` whenever the episode changed. This caused the episode-cascade problem:

```
Scrub through global timeline
→ mpvLoadFile(Ep1)
→ mpvLoadFile(Ep2)
→ mpvLoadFile(Ep3)   ← blink, subtitle reload, cache reset
```

### New Behavior

**Two separate concerns — decoupled:**

| Concern | Trigger | Action |
|---------|---------|--------|
| **Timeline Playhead** | User clicks or drags timeline | Move `playhead_ms` only. No MPV call. |
| **MPV Preview** | User explicitly selects an episode (sidebar click or clip click) | `mpvLoadFile(episode.path, source_time_sec)` |

**Rule:**
- The global timeline is a **virtual editor view only**.
- MPV only previews the **currently selected episode** (`selectedEpisodeId`).
- `selectedEpisodeId` changes **only when the user explicitly clicks** an episode in the list or a clip in the timeline.
- Scrubbing the timeline playhead does **NOT** change `selectedEpisodeId`.
- When `selectedEpisodeId` changes, MPV loads the new file at `source_start_ms` of its first segment.

### Changes Required

#### [MODIFY] `+page.svelte`
- **Remove** the `$effect` that watches `playhead_ms` and calls `mpvSeek`.
- **Remove** the `$effect` that watches `selectedEpisodeId` and calls `mpvLoadFile`.
- **Add** a single function `selectEpisodeForPreview(episodeId)` that:
  1. Sets `projectStore.selectedEpisodeId = episodeId`
  2. Finds the first segment of that episode
  3. Calls `mpvLoadFile(episode.path, firstSegment.source_start_ms / 1000)`
- Pass this function as a prop to `EpisodeList` and `Timeline`.

#### [MODIFY] `EpisodeList.svelte`
- Accept a prop: `onSelectEpisode: (id: string) => void`
- Call `onSelectEpisode(id)` on episode click (instead of directly setting `selectedEpisodeId`).

#### [MODIFY] `Timeline.svelte`
- On timeline **click**: update `playhead_ms` only. Do **NOT** call `mpvLoadFile`.
- On **clip click** (explicit intent): call `onSelectEpisode(clip.episode_id)` via prop.
- Accept a prop: `onSelectEpisode: (id: string) => void`

---

## Revision 2 — Episode → Segments Data Model

### Rationale

The previous `TimelineClip[]` flat list conflated episode identity with segments.
The new model makes the hierarchy explicit:

```
Episode 1
  └── Segment 1: 00:00 → 01:31   (intro, will be deleted)
  └── Segment 2: 01:31 → 22:03   (content)
  └── Segment 3: 22:03 → 23:41   (outro, will be deleted)

Episode 2
  └── Segment 1: 00:00 → 23:45
  ...
```

This design:
- Preserves source files (no mutation)
- Makes intro/outro template trivial (find by `source_start_ms` range)
- Makes encode pipeline clear (each segment = one `trim` filter)
- Makes delete operations safe (`deleted: true` flag, no array splices needed for soft-delete)

### New Type: `EpisodeSegment`

#### [MODIFY] `src/lib/types/index.ts`

```typescript
export interface EpisodeSegment {
  id: string;
  episode_id: string;          // Parent episode
  source_start_ms: number;     // Position in original video file
  source_end_ms: number;       // Position in original video file
  timeline_offset_ms: number;  // Computed global position (read-only, derived)
  deleted: boolean;            // Soft-delete flag — never mutates source
}

// Backward-compat alias (temporary during migration)
export type TimelineClip = EpisodeSegment;
```

> [!IMPORTANT]
> `TimelineClip` is **renamed** to `EpisodeSegment`. The old name is retired.
> The alias `TimelineClip = EpisodeSegment` will be kept temporarily during migration.

### Store Refactor

#### [MODIFY] `src/lib/stores/project_store.svelte.ts`

```typescript
// Rename clips → segments everywhere
segments = $state<EpisodeSegment[]>([]);

// New derived: segments grouped by episode_id
get segmentsByEpisode(): Map<string, EpisodeSegment[]> {
  const map = new Map<string, EpisodeSegment[]>();
  for (const seg of this.segments) {
    if (!seg.deleted) {
      const arr = map.get(seg.episode_id) ?? [];
      arr.push(seg);
      map.set(seg.episode_id, arr);
    }
  }
  return map;
}

// New derived: only non-deleted segments (used for timeline rendering)
get activeSegments(): EpisodeSegment[] {
  return this.segments.filter(s => !s.deleted);
}
```

**Operations (all virtual, no file mutation):**

| Operation | Behavior |
|-----------|----------|
| `splitSegment(global_ms)` | Find active segment at `global_ms`, split into 2 segments |
| `deleteLeft(global_ms)` | Trim `source_start_ms` forward; if length = 0, set `deleted = true` |
| `deleteRight(global_ms)` | Trim `source_end_ms` backward; if length = 0, set `deleted = true` |
| `softDeleteSegment(id)` | Set `deleted = true` on segment by ID |
| `recalculateOffsets()` | Recompute `timeline_offset_ms` for all `activeSegments` |

> [!NOTE]
> `deleted = true` never removes the array element. This preserves undo/redo integrity
> and means the source mapping is always recoverable.

### Timeline Rendering Update

#### [MODIFY] `Timeline.svelte`

- Replace `projectStore.clips` → `projectStore.activeSegments`
- Render each segment with an **episode number label** and **segment index** within that episode.
- Visually group segments of the same episode with the same color hue.
- Show segment boundaries clearly (thin separator line between same-episode segments).

**Clip label format:**
```
[Ep 1 · Seg 2]
01:31 → 22:03
```

---

## Revision 3 — Performance Benchmark Plan

### Current Approach (Approved)
DOM + visibility culling (`visibleClips = $derived.by(...)` in `Timeline.svelte`).
This is acceptable for the current phase.

### Benchmark Target

When 649 episodes are loaded, we must measure:

| Metric | Target | Warning Threshold |
|--------|--------|-------------------|
| Initial render (DOM paint) | < 500ms | > 1000ms |
| Scroll FPS (60hz display) | ≥ 55 fps | < 45 fps |
| Zoom in/out FPS | ≥ 55 fps | < 45 fps |
| Memory (heap after render) | < 150 MB | > 300 MB |

### How to Benchmark (No implementation yet)

A manual benchmark script will be added to `src/routes/debug/+page.svelte` (dev-only):
1. Programmatically generate 649 mock episodes × 1 segment each.
2. Measure `performance.now()` before/after first render.
3. Use `requestAnimationFrame` loop to measure scroll FPS.
4. Use Chrome DevTools Memory tab for heap snapshot.

### Migration Path (If Performance Drops)

If thresholds are breached, we will migrate in this order:

```
Phase A (current): DOM + visibility culling
    ↓ if scroll FPS < 45
Phase B: True virtualized DOM (fixed-height rows, only render visible + 10 buffer)
    ↓ if still failing at 649+ episodes
Phase C: Canvas-based timeline (full 2D canvas rendering, zero DOM nodes for clips)
```

> [!NOTE]
> No implementation required for Phase B or C yet. This plan documents the migration
> path so the architecture remains open for it.

---

## Execution Steps

### Step 1 — Types
- Rename `TimelineClip` → `EpisodeSegment`, add `deleted: boolean` field.
- Keep `TimelineClip` as type alias temporarily.

### Step 2 — Store
- Rename `clips` → `segments` in `project_store.svelte.ts`
- Add `activeSegments` derived getter
- Add `segmentsByEpisode` derived getter
- Rename `splitClip` → `splitSegment`
- Add soft-delete behavior to `deleteLeft` / `deleteRight`

### Step 3 — MPV Decoupling
- Remove auto-switch `$effect`s from `+page.svelte`
- Add explicit `selectEpisodeForPreview(id)` function
- Wire prop through `EpisodeList` and `Timeline`

### Step 4 — Timeline Rendering
- Update `Timeline.svelte` to use `activeSegments`
- Add episode-group coloring
- Add segment label (`Ep N · Seg M`)
- Ensure clip click calls `onSelectEpisode` prop

### Step 5 — Benchmark Page (Dev Only)
- Create `src/routes/debug/+page.svelte`
- Mock 649 episodes × 1 segment
- Add render time + FPS measurement

---

## Verification Plan

### Manual Verification
1. Import 3 episodes → timeline shows 3 segments.
2. Click Episode 2 in sidebar → MPV loads Episode 2. Timeline playhead stays at current position.
3. Scrub timeline across Episode 1→2→3 boundary → MPV does NOT switch files.
4. Ctrl+B at a point in Episode 2 → Episode 2 splits into 2 segments. Timeline shows `Ep 2 · Seg 1` and `Ep 2 · Seg 2`.
5. Q (delete left) on a segment → segment shortens. If entire segment deleted, it becomes `deleted: true`.
6. Undo (Ctrl+Z) → restored.

### Automated
- No Rust changes in this plan → no Rust tests needed.
- TypeScript type check: `pnpm check` should pass after rename.
