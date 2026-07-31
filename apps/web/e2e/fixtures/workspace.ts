import type { Page } from '@playwright/test';

/**
 * Open the workspace strip when it is still collapsed.
 *
 * Conversation hydration may auto-expand the panel between the visibility
 * check and the click. A disappearing strip means the requested end state was
 * already reached, so the click is intentionally best-effort and idempotent.
 */
export async function expandWorkspaceIfCollapsed(page: Page): Promise<void> {
  const collapsed = page.getByTestId('yops-panel-collapsed');
  if (await collapsed.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await collapsed.click({ timeout: 2_000 }).catch(() => {});
  }
}
