# Donghua Nexus - Milestone 1 Walkthrough

Milestone 1 (Foundation) has been successfully implemented and verified to compile properly without errors for both Rust (Backend) and SvelteKit (Frontend).

## What Was Computed & Developed

### 1. Project Organization
- Wired frontend `SvelteKit 5` runes with backend `Tauri v2`.

### 2. Video Import Workflow (Refined)
- **Massive Batch Ready**: Extractor processing happens concurrently in Rust `tokio::process`, smoothly avoiding blocking while resolving dozens of episodes natively.
- **True Drag & Drop Interface**: Catching global OS `tauri://drop` and `tauri://drag-enter` events to trigger glowing UI layouts alongside filtering exactly `.mp4` and `.mkv` extensions.
- **Smart Deduping**: Identical file imports are caught actively against precise Absolute Paths resolving duplication clashes.
- **Extended Metadata Aggregation**:
   - [EpisodeList.svelte](file:///d:/Documents/GitHub/donghua-nexus/src/lib/components/import/EpisodeList.svelte) lists all fine-grain FFprobe variables (FPS, Subtitle total count, explicit Video/Audio Codecs format tags).
   - Core Project Store computes the full layout's `overall Project Size + length` iteratively.
- **Natural Sorting**: When videos like `Episode 1.mkv`, `Episode 10.mkv`, `Episode 2.mkv` are dropped, the [natural_sort](file:///d:/Documents/GitHub/donghua-nexus/src-tauri/src/natural_sort.rs#72-75) Rust module properly aligns them naturally.
- **Stores**: No external libraries; built completely on Svelte 5 Runes `$state` making Undo/Redo integration in later milestones flawless.
- **Timeline Rendering**: A timeline viewer that proportionally scales clip blocks across a single unified track. Playhead positioning and scrolling zooms have been mocked functionally.
- **Dark Mode CSS Variable System**: Clean GitHub-styled native UI colors minimizing distractions.

### 4. MPV Preview Integration
- MPV is completely bound over IPC. 
- When triggering **"START MPV PREVIEW"**, Rust seamlessly spawns MPV headless server configured into a Named Pipe IPC `\\.\pipe\donghua-nexus-mpv`.
- Play/Pause & Frame Forward/Backward buttons inside Svelte now interact directly with the running MPV context instance natively without complex webview embedding.

## How to Test Next
To view your app in action, run:
```bash
pnpm tauri dev
```
1. Drag and drop MKV/MP4 files or browse using the dialog button.
2. The UI will swap to show your Episodes List, Subtitles tracking panel (placeholder) and your unified Video Track blocks.
3. Click `START MPV PREVIEW` and play with the timeline features!
