/**
 * Shared save-status type for workspace stores.
 *
 * The timer that flips `'saved' -> 'idle'` after a delay used to live
 * here as `createSaveStatusTimer`. Per v2 §2.5 (store is pure state),
 * that browser-timer side effect now lives in
 * `@/hooks/shared/useSaveStatusAutoIdle`. Stores only own the status field
 * and a `setSaveStatusIdle` setter; the hook drives the transition.
 */

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
