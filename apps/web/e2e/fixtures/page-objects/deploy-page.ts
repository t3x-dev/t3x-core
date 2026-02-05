import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class DeployPage {
  readonly page: Page;
  readonly addAgentButton: Locator;
  readonly refreshButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.addAgentButton = page.locator('button:has-text("Add Agent")').first();
    this.refreshButton = page.locator('button:has-text("Refresh")').first();
  }

  async goto(): Promise<void> {
    await this.page.goto('/deploy');
  }

  async waitForLoad(timeout = 15000): Promise<void> {
    const heading = this.page
      .locator('text=Deploy Agents')
      .or(this.page.locator('text=Runner service'));
    await expect(heading.first()).toBeVisible({ timeout });
  }

  async isRunnerOffline(): Promise<boolean> {
    return this.page
      .locator('text=Runner service is not connected')
      .first()
      .isVisible()
      .catch(() => false);
  }

  async getAgentCards(): Promise<Locator> {
    return this.page.locator('[class*="card"]').filter({ hasText: 'Endpoint' });
  }

  async getAgentCardsCount(): Promise<number> {
    const cards = await this.getAgentCards();
    return cards.count();
  }

  async openAddAgentForm(): Promise<void> {
    await this.addAgentButton.click();
  }

  async fillAddAgentForm(id: string, name: string, endpoint: string): Promise<void> {
    await this.page.locator('input[placeholder*="Agent ID"]').fill(id);
    await this.page.locator('input[placeholder*="Agent Name"]').fill(name);
    await this.page.locator('input[placeholder*="Endpoint"]').fill(endpoint);
  }

  async submitAddAgent(): Promise<void> {
    await this.page.locator('button:has-text("Register")').click();
  }

  async deleteAgent(agentName: string): Promise<void> {
    const card = this.page.locator(`[class*="card"]:has-text("${agentName}")`);
    const deleteButton = card
      .locator('button')
      .filter({ hasText: /delete/i })
      .or(card.locator('button[aria-label*="delete" i]'));
    await deleteButton.first().click();
  }

  async getRunsTableRows(): Promise<number> {
    const table = this.page.locator('table').first();
    const isVisible = await table.isVisible().catch(() => false);
    if (!isVisible) return 0;
    const rows = table.locator('tbody tr');
    return rows.count();
  }

  async hasModelFilter(): Promise<boolean> {
    return this.page
      .locator('text=All Models')
      .or(this.page.locator('select[name="model"]'))
      .first()
      .isVisible()
      .catch(() => false);
  }

  async clickRunRow(index: number): Promise<void> {
    const table = this.page.locator('table').first();
    const row = table.locator('tbody tr').nth(index);
    await row.click();
  }
}
