class ProcessingStore {
  importing = $state(false);
  importProgress = $state(0);
  importTotal = $state(0);

  isProcessing = $state(false);
  processingLabel = $state("");
  processingDetails = $state<{ episodeIdx?: number; segmentIdx?: number } | null>(null);

  clear() {
    this.importing = false;
    this.importProgress = 0;
    this.importTotal = 0;
    this.isProcessing = false;
    this.processingLabel = "";
    this.processingDetails = null;
  }
}

export const processingStore = new ProcessingStore();
