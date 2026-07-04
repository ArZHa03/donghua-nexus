# Implementation Plan - Timeline Editing Foundation (v1)

This plan outlines the architecture and implementation steps for building a fast, offline-first timeline editor specialized for Donghua/Anime batch-processing. Our design prioritizes low memory usage, responsive UI, and maintainability.

## 1. Architecture Design

The foundation will rely strictly on an in-memory Data Model using Svelte 5 runes (`$state` / `$derived`). The timeline acts primarily as a view of a structured list of clips. Editing operations (Split, Delete L/R) will be pure data transformations on the `clips` array without modifying the source video files.

*   **Offline-First:** All state mutations are local.
*   **Sequential Track:** We will treat the Timeline as a single, contiguous horizontal track. No gaps; everything is appended or ripped together ("auto mepet").
*   **Virtual DOM Target:** We will use standard DOM elements with localized visibility culling (simple virtualization) to ensure scaling up to 649+ episodes flawlessly.

## 2. State Management Design

We will refine our store structures to handle chronological mapping efficiently.

**Data Model Updates ([project_store.svelte.ts](file:///d:/Documents/GitHub/donghua-nexus/src/lib/stores/project_store.svelte.ts))**:
*   `clips: TimelineClip[]`: Contains `{ id, episode_id, source_start_ms, source_end_ms, timeline_offset_ms }`.
*   Operations:
    *   `splitClip(global_ms)`: Identifies the intersecting clip and breaks it into two contiguous objects.
    *   `deleteLeft(global_ms)`: Modifies the `source_start_ms` of the intersecting clip. If the clip length hits 0, it is removed.
    *   `deleteRight(global_ms)`: Modifies the `source_end_ms`.
    *   [recalculateOffsets()](file:///d:/Documents/GitHub/donghua-nexus/src/lib/stores/project_store.svelte.ts#61-68): Runs automatically after any modification to ripple the changes and enforce gapless alignment.

**Playback Store Updates ([playback_store.svelte.ts](file:///d:/Documents/GitHub/donghua-nexus/src/lib/stores/playback_store.svelte.ts))**:
*   Holds `playhead_ms` (global timeline time) and `zoom_level` (0.25, 0.5, 1.0, 2.0).

## 3. Timeline Rendering Design

*   **Layout:** An `overflow-x: scroll` container harboring a single track element. 
*   **Scaling:** The track width is `total_duration_ms * zoom_level`.
*   **Virtualization:** A `$derived` view will only render clips whose `[timeline_offset_ms, offset + duration]` intersect with the current scroll viewport. This ensures the DOM rarely exceeds ~20-30 nodes regardless of having 600+ episodes.
*   **Playhead:** A sticky/absolute-positioned `<div class="playhead">` that follows `playhead_ms`. 
*   **Interactions:** Click tracking on the timeline container calculates global time [(scrollLeft + event.clientX) / zoom_level](file:///d:/Documents/GitHub/donghua-nexus/src-tauri/src/lib.rs#12-32) and updates playback state.

## 4. MPV Synchronization Design

We need robust two-way syncing between the Svelte Timeline and the MPV instance.

*   **Svelte → MPV (Seek/Selection):** 
    *   When the user clicks the timeline or drags the playhead, we calculate `event -> global_ms`.
    *   We locate the corresponding clip: `const target = clips.find(c => global_ms >= c.offset && ...)`.
    *   We automatically select the corresponding episode (`selectedEpisodeId = target.episode_id`).
    *   If the selected episode changed, we send [mpvLoadFile(episode.path, source_time)](file:///d:/Documents/GitHub/donghua-nexus/src/lib/tauri_commands.ts#17-20). If it's the same episode, we send [mpvSeek(source_time)](file:///d:/Documents/GitHub/donghua-nexus/src/lib/tauri_commands.ts#21-24).
*   **MPV → Svelte (Playback):** 
    *   MPV emits `time-pos` events via Tauri.
    *   A Tauri event listener in Svelte maps the video's local `time-pos` back to `global_ms` based on the currently selected clip and updates the timeline playhead.

*Note: If the current Rust MPV backend does not emit IPC events for `time-pos`, we may need to implement a simple polling interval or event forwarder in Rust.*

## 5. Keyboard Shortcut Specifications

Global `svelte:window` listeners handling:
*   **Ctrl + B:** Invoke `projectStore.splitClip(playbackStore.playhead_ms)`
*   **Q:** Invoke `projectStore.deleteLeft(playbackStore.playhead_ms)`
*   **W:** Invoke `projectStore.deleteRight(playbackStore.playhead_ms)`
*   **Space / Arrows:** Map to respective MPV playback/frame commands `tauriCommands`.

## Execution Steps

1.  Enhance [TimelineClip](file:///d:/Documents/GitHub/donghua-nexus/src/lib/types/index.ts#25-32) model.
2.  Implement `split`, `deleteLeft`, `deleteRight` and `auto mepet` ripple functions in Svelte stores.
3.  Build the `<Timeline>` interface: scrolling container, virtualized clips, zoom controls.
4.  Implement two-way MPV binding and the global keyboard event listener.

## User Review Required

> [!IMPORTANT]
> Please review the architecture constraints—specifically the MPV handling. MPV plays specific files sequentially. In our design, as the global playhead crosses the boundary from Episode 1 to Episode 2, the frontend detects this and issues a new [mpvLoadFile](file:///d:/Documents/GitHub/donghua-nexus/src/lib/tauri_commands.ts#17-20) command for Episode 2. Does this align with your expectations?
