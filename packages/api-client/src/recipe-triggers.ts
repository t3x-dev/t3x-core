/** Events currently dispatched with a project ID by the Merge and Check APIs. */
export const RECIPE_TRIGGER_EVENTS = ['merge.completed', 'check.failed'] as const;

export function isRecipeTriggerAvailable(event: string): boolean {
  return RECIPE_TRIGGER_EVENTS.some((available) => available === event);
}
