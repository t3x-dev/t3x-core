/**
 * Preview cache and debounce state for draft preview operations.
 * Shared between drafts-crud (cleanup on delete) and drafts-workflows (preview generation).
 */
export const previewDebounce = new Map<string, number>();

export const previewCache = new Map<
  string,
  { hash: string; output: string; model: string; tokens: number; time: number }
>();
