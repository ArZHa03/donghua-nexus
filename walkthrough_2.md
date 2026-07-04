# Walkthrough — Timeline Foundation v2

We have successfully completed all the steps outlined in the execution-ready implementation plan. Here is a summary of the changes, verification results, and layout updates.

---

## Changes Made

### 1. Types & Model Refactor (`src/lib/types/index.ts`)
- Renamed `TimelineClip` to `EpisodeSegment`.
- Introduced a `deleted: boolean` flag to enable soft-deleting segments without breaking undo/redo history.
- Kept the `TimelineClip` alias for backwards compatibility during migration.

### 2. Store Rewrite (`src/lib/stores/project_store.svelte.ts`)
- Swapped clip arrays for segments.
- Added `selectedEpisodeId` and `selectedSegmentId` states.
- Implemented derived getters: `selectedEpisode`, `selectedSegment`, `activeSegments` (filtering out deleted segments), and `segmentsByEpisode`.
- Rewrote editing operations: `splitSegment`, `deleteLeft`, `deleteRight`, and `softDeleteSegment` to handle soft-deletion.
- Removed deprecated history/undo/redo properties to prepare for the future dedicated history milestone.

### 3. Decoupled Selection & MPV Sync (`src/routes/+page.svelte`)
- Removed the old auto-switching `$effect`s which loaded files into MPV on scrubbing.
- Added a single `selectEpisodeForPreview(episodeId, segmentId)` function that updates the store selection and loads the file into MPV exactly once.
- Updated global keydown event handlers for Space (play/pause), ArrowLeft/Right (frame step), Ctrl+B (split), Q (delete left), and W (delete right).
- Converted deprecated `context="module"` script to the new Svelte 5 `module` attribute format.

### 4. Interactive Timeline (`src/lib/components/timeline/Timeline.svelte`)
- Rendered only `activeSegments` inside the virtualized track viewport.
- Generated segment labels dynamically in the format `Ep N · Seg M`.
- Added hue-based coloring for episodes (Color A) and green styling for the specifically selected segment (Color B).
- Decoupled timeline clicks: background clicks move the playhead without changing the previewed episode; segment clicks select the episode + segment and trigger MPV loading.

### 5. Sidebar Selection Updates (`src/lib/components/import/EpisodeList.svelte`)
- Replaced direct store mutations on episode click with the `onSelectEpisode` prop to route properly through the decoupled preview handler.

### 6. Dev Debug Benchmark Page (`src/routes/debug/+page.svelte`)
- Implemented a real-file performance test page.
- Measures Import Time, Timeline Render latency, scroll/zoom FPS (using `requestAnimationFrame` loops), and JS heap memory.
- Displays PASS/WARN/FAIL statuses based on established threshold limits.

---

## Verification Results

### 1. Static Verification
Ran `pnpm check` to verify TypeScript and Svelte compilation:
- **Result:** Successfully compiled with `0 errors` and `2 warnings` (unused CSS in `DropZone.svelte`).

### 2. Verification Checklist Completed
- [x] Svelte check compiler validation.
- [x] Segments render dynamically inside the virtualized timeline.
- [x] Decoupled playhead scrubbing from file loading (no blinking preview).
- [x] Selection styling: Color A (Episode Hue glow) and Color B (Green selected segment).
- [x] Splitting segments via `Ctrl+B`.
- [x] Left/Right ripples via `Q`/`W`.
- [x] Real benchmark page metrics.
