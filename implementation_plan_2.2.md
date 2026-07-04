# Implementation Plan - Stable Import System & Subtitle Metadata (v3)

Refactor the import system to be persistent, support folder scanning, and provide detailed subtitle metadata visualization.

## Proposed Changes

### Core Configuration & Rust
#### [MODIFY] [tauri.conf.json](file:///d:/Documents/GitHub/donghua-nexus/src-tauri/tauri.conf.json)
- Ensure `dragDropEnabled: true`.

#### [MODIFY] [video_import.rs](file:///d:/Documents/GitHub/donghua-nexus/src-tauri/src/commands/video_import.rs)
- Add `scan_folder_recursive(path: String) -> Vec<String>` helper.
- Ensure natural sorting is applied to all found paths.

#### [MODIFY] [lib.rs](file:///d:/Documents/GitHub/donghua-nexus/src-tauri/src/lib.rs)
- Register `import_folder` (if added) or update [import_videos](file:///d:/Documents/GitHub/donghua-nexus/src-tauri/src/commands/video_import.rs#5-33) to handle folders if needed. (Actually, a separate `scan_folder` command returning paths is cleaner).

### Frontend Stores
#### [MODIFY] [project_store.svelte.ts](file:///d:/Documents/GitHub/donghua-nexus/src/lib/stores/project_store.svelte.ts)
- Add `selectedEpisodeId` to track which episode is currently being edited/viewed.
- Update [addEpisodes](file:///d:/Documents/GitHub/donghua-nexus/src/lib/stores/project_store.svelte.ts#24-42) to ensure it always appends correctly.

### Frontend Components
#### [MODIFY] [DropZone.svelte](file:///d:/Documents/GitHub/donghua-nexus/src/lib/components/import/DropZone.svelte)
- Rename to `GlobalDropTarget.svelte`.
- Move its logic to be an overlay that appears on `drag-enter` and disappears on `drop` or `drag-leave`.
- Make it persistent in [+page.svelte](file:///d:/Documents/GitHub/donghua-nexus/src/routes/+page.svelte).

#### [MODIFY] [EpisodeList.svelte](file:///d:/Documents/GitHub/donghua-nexus/src/lib/components/import/EpisodeList.svelte)
- Add "Add Files" and "Add Folder" buttons.
- Add selection logic: clicking an episode sets `projectStore.selectedEpisodeId`.
- Highlight the selected episode.

#### [MODIFY] [+page.svelte](file:///d:/Documents/GitHub/donghua-nexus/src/routes/+page.svelte)
- Always render `GlobalDropTarget` (as an overlay).
- Always show the editor layout (sidebar + main stage).
- Main stage shows `PreviewPlayer` if an episode is selected, or a welcome message.
- Update the Subtitle panel to show detailed metadata of the selected episode.

## Verification Plan

### Manual Verification
- **Multiple Imports:** 
    1. Import 5 files.
    2. Click "+ Add Files", import 5 more. Verify total 10.
    3. Drag 2 more files. Verify total 12.
- **Import Folder:**
    1. Click "+ Add Folder", select a folder with nested MKVs.
    2. Verify all are scanned, sorted naturally, and imported.
- **Drag & Drop:**
    1. Drag files onto the app at any time (empty or full project).
    2. Verify overlay appears and files import correctly.
- **Subtitle Metadata:**
    1. Select an episode.
    2. Open Subtitle panel.
    3. Verify detailed list of tracks (Language, Codec, etc.).
- **Duplicates:** Verify re-importing a folder or file ignores existing paths.
