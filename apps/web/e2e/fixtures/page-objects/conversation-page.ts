import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class ConversationPage {
  readonly page: Page;
  readonly contextPanel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.contextPanel = page.locator('aside').filter({ hasText: 'Context' }).first();
  }

  async goto(_projectId: string, conversationId: string): Promise<void> {
    await this.page.goto(`/chat/${conversationId}`);
  }

  async gotoWithHighlight(
    _projectId: string,
    conversationId: string,
    turnHash: string,
    startChar: number,
    endChar: number
  ): Promise<void> {
    const url = `/chat/${conversationId}?turn=${turnHash}&highlight=${startChar}-${endChar}`;
    await this.page.goto(url);
  }

  /** #1, #14: Wait for actual turn role labels (You/T3X) to appear. */
  async waitForLoad(timeout = 15000): Promise<void> {
    const turnBadge = this.page
      .locator('text=You')
      .or(this.page.locator('text=T3X'));
    await expect(turnBadge.first()).toBeVisible({ timeout });
  }

  /** #9: Use role label text instead of fragile Tailwind class selectors. */
  getTurnCards(): Locator {
    return this.page.locator('text=You').or(this.page.locator('text=T3X'));
  }

  async getTurnCount(): Promise<number> {
    const userTurns = this.page.locator('text=You');
    const assistantTurns = this.page.locator('text=T3X');
    return (await userTurns.count()) + (await assistantTurns.count());
  }

  /** #15: Use locator containsText instead of hasTurnWithContent + slice. */
  async expectTurnContent(content: string, timeout = 10000): Promise<void> {
    const turn = this.page.locator(`text=${content}`).first();
    await expect(turn).toBeVisible({ timeout });
  }

  async getHighlightedText(): Promise<string | null> {
    const mark = this.page.locator('mark').first();
    const isVisible = await mark.isVisible().catch(() => false);
    if (!isVisible) return null;
    return mark.textContent();
  }

  async hasSourceBadge(): Promise<boolean> {
    return this.page
      .locator('text=Source')
      .first()
      .isVisible()
      .catch(() => false);
  }

  async hasContextPanel(): Promise<boolean> {
    const panel = this.page.locator('aside').filter({ hasText: 'Context' }).first();
    return panel.isVisible().catch(() => false);
  }

  /** #13: Locate back button by its navigation behavior, not generic SVG. */
  getBackButton(): Locator {
    return this.page
      .locator('a[href*="/project/"]')
      .or(this.page.locator('button:near(:text("Back"))'))
      .first();
  }
}
