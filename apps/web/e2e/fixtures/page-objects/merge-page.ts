import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class MergePage {
  readonly page: Page;
  readonly commitButton: Locator;
  readonly cancelButton: Locator;
  readonly messageInput: Locator;

  constructor(page: Page) {
    this.page = page;
    // Matches all button text variants:
    //   "Confirm"       — default mode (mergeConfirm default)
    //   "Execute Merge" — developer mode (mergeConfirm developer)
    this.commitButton = page
      .locator('button:has-text("Confirm")')
      .or(page.locator('button:has-text("Execute Merge")'))
      .first();
    this.cancelButton = page.locator('button:has-text("Cancel")').first();
    this.messageInput = page
      .locator('input[placeholder*="message" i]')
      .or(page.locator('input[placeholder*="Merge" i]'))
      .first();
  }

  async goto(projectId: string, mergeId: string): Promise<void> {
    await this.page.goto(`/project/${projectId}/merge/${mergeId}`);
  }

  async waitForLoad(timeout = 15000): Promise<void> {
    // Wait for the action bar commit button — present in both sentence and frame mode.
    // Button text variants:
    //   "Confirm"       — default mode (mergeConfirm default)
    //   "Execute Merge" — developer mode (mergeConfirm developer)
    const workspace = this.page
      .locator('button:has-text("Confirm")')
      .or(this.page.locator('button:has-text("Execute Merge")'));
    await expect(workspace.first()).toBeVisible({ timeout });
  }

  async getUnresolvedCount(): Promise<number> {
    // Badge text variants:
    //   "N unresolved"     — developer mode (t('unresolved') = "Unresolved")
    //   "N needs decision" — default mode   (t('unresolved') = "Needs Decision")
    const badge = this.page
      .locator('text=/\\d+ unresolved/i')
      .or(this.page.locator('text=/\\d+ needs decision/i'))
      .first();
    const isVisible = await badge.isVisible();
    if (!isVisible) return 0;
    const text = await badge.textContent();
    const match = text?.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  async hasConflictsSection(): Promise<boolean> {
    // Frame mode: h3 "Conflicts (N)" (CSS uppercase → "CONFLICTS (N)")
    // Sentence mode: sidebar "Conflicts" label
    // Default mode: "冲突"
    // Use getByText for case-insensitive, element-agnostic matching
    const loc = this.page.getByText(/conflicts/i).first();
    return loc.isVisible({ timeout: 5000 }).catch(() => false);
  }

  async hasIdenticalSection(): Promise<boolean> {
    // Frame mode: h3 "Auto-kept (N)" (CSS uppercase → "AUTO-KEPT (N)")
    // Sentence mode: "Identical"
    // Default mode: "未变化"
    const loc = this.page
      .getByText(/auto-kept|identical/i)
      .first();
    return loc.isVisible({ timeout: 5000 }).catch(() => false);
  }

  async hasSourceOnlySection(): Promise<boolean> {
    // MergeNavSidebar: button "Source Only", MergeWorkspace: h3 "Source only (N)"
    const loc = this.page
      .locator('button:has-text("Source Only")')
      .or(this.page.locator('h3:has-text("Source only")'));
    return loc.first().isVisible().catch(() => false);
  }

  async hasTargetOnlySection(): Promise<boolean> {
    // MergeNavSidebar: button "Target Only", MergeWorkspace: h3 "Target only (N)"
    const loc = this.page
      .locator('button:has-text("Target Only")')
      .or(this.page.locator('h3:has-text("Target only")'));
    return loc.first().isVisible().catch(() => false);
  }

  /**
   * Resolve the nth conflict. Scoped to the conflict card, not global nth. (#12)
   */
  async resolveConflict(
    index: number,
    pick: 'Keep A' | 'Keep B' | 'Keep Both' | 'Edit'
  ): Promise<void> {
    const conflictCards = this.page.locator('text=/Conflict \\d+/');
    const card = conflictCards.nth(index);
    await expect(card).toBeVisible({ timeout: 5000 });

    // Scope the button search to the ancestor card container
    const cardContainer = card.locator('xpath=ancestor::div[contains(@class,"rounded")]');
    const button = cardContainer.locator(`button:has-text("${pick}")`).first();
    await button.click();
  }

  /**
   * Toggle the Source Only section header (collapse/expand).
   * Note: Section starts expanded by default (defaultCollapsed=false).
   */
  async toggleSourceOnlySection(): Promise<void> {
    const sourceSection = this.page.locator('button:has-text("Source Only")').first();
    await sourceSection.click();
  }

  async setMessage(message: string): Promise<void> {
    await this.messageInput.fill(message);
  }

  /** Wait for auto-save to complete by checking the "Saved" status indicator. (#5) */
  async waitForSaved(timeout = 10000): Promise<void> {
    const savedIndicator = this.page.locator('text=Saved').first();
    await expect(savedIndicator).toBeVisible({ timeout });
  }

  async commit(): Promise<void> {
    await this.commitButton.click();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }

  async waitForRedirect(expectedPath: RegExp, timeout = 10000): Promise<void> {
    await this.page.waitForURL(expectedPath, { timeout });
  }

  async isCommitEnabled(): Promise<boolean> {
    return this.commitButton.isEnabled();
  }
}
