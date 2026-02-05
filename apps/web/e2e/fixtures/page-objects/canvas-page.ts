import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class CanvasPage {
  readonly page: Page;
  readonly canvas: Locator;
  readonly sidebar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.canvas = page.locator('.react-flow');
    this.sidebar = page.locator('aside').first();
  }

  async goto(projectId: string): Promise<void> {
    await this.page.goto(`/project/${projectId}`);
  }

  async waitForLoad(timeout = 15000): Promise<void> {
    await expect(this.canvas).toBeVisible({ timeout });
  }

  /** Returns a locator for a node by its data-id (no await needed). */
  getNodeByHash(hash: string): Locator {
    return this.page.locator(`[data-id="${hash}"]`);
  }

  /** Returns a locator for a node containing the given text. */
  getNodeByText(text: string): Locator {
    return this.page.locator(`.react-flow__node:has-text("${text}")`);
  }

  async clickNode(hashOrText: string): Promise<void> {
    const node = hashOrText.startsWith('sha256:')
      ? this.getNodeByHash(hashOrText)
      : this.getNodeByText(hashOrText);
    await node.first().click();
  }

  async waitForSidebar(timeout = 10000): Promise<void> {
    await expect(this.sidebar).toBeVisible({ timeout });
  }

  async getSidebarContent(): Promise<string> {
    return (await this.sidebar.textContent()) ?? '';
  }

  async getNodesCount(): Promise<number> {
    const nodes = this.page.locator('.react-flow__node');
    return nodes.count();
  }

  async switchMode(mode: 'editor' | 'execution'): Promise<void> {
    const modeButton = this.page.locator(`button:has-text("${mode}")`).first();
    await modeButton.click();
  }
}
