import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class MergePage {
  readonly page: Page;
  readonly commitButton: Locator;
  readonly cancelButton: Locator;
  readonly messageInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.commitButton = page.locator('button:has-text("Commit Merge")').first();
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
    // #1: Removed networkidle — wait for concrete merge UI elements
    const workspace = this.page
      .locator('button:has-text("Commit Merge")')
      .or(this.page.locator('text=Conflicts'))
      .or(this.page.locator('text=Identical'));
    await expect(workspace.first()).toBeVisible({ timeout });
  }

  async getUnresolvedCount(): Promise<number> {
    const badge = this.page.locator('text=/\\d+ unresolved/').first();
    const isVisible = await badge.isVisible();
    if (!isVisible) return 0;
    const text = await badge.textContent();
    const match = text?.match(/(\d+) unresolved/);
    return match ? parseInt(match[1], 10) : 0;
  }

  async hasConflictsSection(): Promise<boolean> {
    return this.page
      .locator('button:has-text("Conflicts")')
      .first()
      .isVisible()
      .catch(() => false);
  }

  async hasIdenticalSection(): Promise<boolean> {
    return this.page
      .locator('button:has-text("Identical")')
      .first()
      .isVisible()
      .catch(() => false);
  }

  async hasSourceOnlySection(): Promise<boolean> {
    return this.page
      .locator('button:has-text("Source Only")')
      .first()
      .isVisible()
      .catch(() => false);
  }

  async hasTargetOnlySection(): Promise<boolean> {
    return this.page
      .locator('button:has-text("Target Only")')
      .first()
      .isVisible()
      .catch(() => false);
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
