/**
 * Pure formatters for the retained-draft failure surface (AfterPanel
 * header label + persistent error row, Apply button tooltip). Pulled
 * into the L2 domain layer so the wording is unit-testable without
 * mounting React.
 *
 * The structured failure shape lives in `workspaceStore.ts`; this file
 * intentionally re-declares only the field subset it reads, so adding
 * a new field there can't accidentally widen this surface.
 */

export interface RetainedFailureFormatInput {
  message: string;
  provider?: string;
  model?: string;
  preset?: 'concise' | 'balanced' | 'detailed';
}

/**
 * Map raw provider/model/preset ids onto the wording the persistent
 * row uses (e.g. `openai` + `gpt-5.4-mini` + `concise` →
 * "openai · gpt-5.4-mini · Concise"). Whichever fields are present
 * appear; missing fields are dropped silently rather than rendered as
 * "unknown" — the message text already conveys the failure.
 */
export function formatRetainedFailureContext(input: RetainedFailureFormatInput): string {
  const parts: string[] = [];
  if (input.provider) parts.push(input.provider);
  if (input.model) parts.push(input.model);
  if (input.preset) {
    parts.push(input.preset.charAt(0).toUpperCase() + input.preset.slice(1));
  }
  return parts.join(' · ');
}

/**
 * Header-row line shown above the rendered retained draft. The
 * "Previous draft retained" tail is fixed so the row reads as one
 * sentence regardless of which context fields are populated.
 *
 * Examples:
 *   "Last extract failed (openai · gpt-5.4-mini · Concise): could not
 *    verify 1 slot(s)... Previous draft retained."
 *   "Last extract failed: LLM call failed. Previous draft retained."
 *     (no context fields known)
 */
export function formatRetainedFailureRow(input: RetainedFailureFormatInput): string {
  const context = formatRetainedFailureContext(input);
  const prefix = context ? `Last extract failed (${context})` : 'Last extract failed';
  return `${prefix}: ${input.message} Previous draft retained.`;
}

/**
 * Tooltip for the Apply button when a retained-draft failure is in
 * effect. The button is the load-bearing affordance — without this
 * change, hovering it after a failed re-extract reads "Apply the
 * script to the tree" as if the latest attempt succeeded.
 */
export function formatApplyTooltipForRetainedFailure(input: RetainedFailureFormatInput): string {
  const context = formatRetainedFailureContext(input);
  const tail = context ? ` (latest ${context} attempt failed)` : ' (latest attempt failed)';
  return `Apply previous draft${tail}`;
}

/** Label rendered at the top of the AfterPanel rendered-tree band. */
export type ResultPanelHeaderLabel =
  | 'Applied result' // No draft staged — showing this conversation's applied yops_log replay.
  | 'Inherited baseline' // Parent commit is visible, but the conversation has no applied changes.
  | 'Draft preview' // Draft staged from a successful Extract; user can Apply.
  | 'Previous draft'; // Draft staged previously, latest Extract attempt failed.

/**
 * Decide which of the three header-label variants AfterPanel should
 * render. Pulled out of the component so the conditional is unit-
 * testable and the wording is locked once — without this, the inline
 * ternary in JSX has to be eyeballed in PR review every time.
 *
 * Precedence reflects what the user actually has:
 *   1. retained failure on top of a draft → "Previous draft"
 *   2. draft → "Draft preview"
 *   3. inherited baseline only → "Inherited baseline"
 *   4. otherwise → applied result (the steady state)
 */
export function getResultPanelHeaderLabel(input: {
  hasDraft: boolean;
  hasRetainedFailure: boolean;
  isInheritedBaselineOnly?: boolean;
}): ResultPanelHeaderLabel {
  if (input.hasDraft && input.hasRetainedFailure) return 'Previous draft';
  if (input.hasDraft) return 'Draft preview';
  if (input.isInheritedBaselineOnly) return 'Inherited baseline';
  return 'Applied result';
}
