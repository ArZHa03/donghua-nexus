# Implementation Plan - Fix Drag & Drop and Improve Import UX

Investigate and fix the non-functional drag and drop feature in the Tauri v2 application, and enhance the import workflow with cumulative imports, duplicate detection, and a "Clear Project" feature.

## Proposed Changes

### Core Configuration
#### [MODIFY] [tauri.conf.json](file:///d:/Documents/GitHub/donghua-nexus/src-tauri/tauri.conf.json)
- Explicitly enable `dragDropEnabled` for the main window (though it's default in v2, being explicit ensures no overrides are causing issues).

### Frontend Stores
#### [MODIFY] [project_store.svelte.ts](file:///d:/Documents/GitHub/donghua-nexus/src/lib/stores/project_store.svelte.ts)
- Enhance [clear()](file:///d:/Documents/GitHub/donghua-nexus/src/lib/stores/project_store.svelte.ts#46-50) to reset all project-related state.
- (Optional) Ensure [addEpisodes](file:///d:/Documents/GitHub/donghua-nexus/src/lib/stores/project_store.svelte.ts#19-37) handles cumulative imports correctly (it already seems to).

#### [MODIFY] [playback_store.svelte.ts](file:///d:/Documents/GitHub/donghua-nexus/src/lib/stores/playback_store.svelte.ts)
- Add a `reset()` method to clear playhead and other playback states.

### Frontend Components
#### [MODIFY] [DropZone.svelte](file:///d:/Documents/GitHub/donghua-nexus/src/lib/components/import/DropZone.svelte)
- Update Tauri event listeners to use Tauri v2 event names:
    - `tauri://drop` -> `tauri://drag-drop`
    - `tauri://drag-enter` -> `tauri://drag-enter` (verify payload/behavior)
    - `tauri://drag-leave` -> `tauri://drag-leave`
- Update payload handling for `drag-drop` to match the `{ paths: string[] }` structure.
- Add debug logging:
    - "drag enter"
    - "drop received"
    - Total file paths count
    - Accepted (non-duplicate) file count

#### [MODIFY] [EpisodeList.svelte](file:///d:/Documents/GitHub/donghua-nexus/src/lib/components/import/EpisodeList.svelte)
- Add a "Clear Project" button in the header.
- Connect the button to the `projectStore.clear()` and `playbackStore.reset()` methods.

## Verification Plan

### Manual Verification
- **Drag & Drop:**
    1. Drag a single MKV file into the DropZone. Verify it imports correctly and logs appear in the console.
    2. Drag multiple MKV files. Verify all are imported and total count is logged.
    3. Drag a mix of MKV and MP4 files. Verify both are accepted.
    4. Drag a duplicate file. Verify it is ignored and the logged "accepted count" excludes it.
- **Import UX:**
    1. Import some files using "Browse".
    2. Import more files using "Drag & Drop". Verify the list grows (cumulative).
    3. Click "Clear Project". Verify the episode list, timeline, and preview are cleared without a page refresh.
