/**
 * Custom Playwright test fixture for shared browser setup.
 *
 * Enables developer mode before page JS runs so UI terms match English selectors
 * (e.g., "Conflicts" instead of "冲突").
 *
 * Usage: import { test, expect } from './fixtures/test' instead of '@playwright/test'
 */

import { test as base, expect } from '@playwright/test';

const test = base.extend({
  page: async ({ page }, use) => {
    // addInitScript runs before any page JS on every new document/navigation
    await page.addInitScript(() => {
      // Enable developer mode — ensures English UI terms for test selectors
      localStorage.setItem(
        't3x-settings',
        JSON.stringify({
          state: {
            developerMode: true,
            userExperience: 'developer',
            defaultView: 'canvas',
            density: 'comfortable',
          },
          version: 0,
        })
      );
    });
    await use(page);
  },
});

export { test, expect };
