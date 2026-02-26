/**
 * Custom Playwright test fixture that suppresses onboarding overlays.
 *
 * Automatically sets localStorage keys before any page JS runs,
 * preventing WelcomeModal, OnboardingDialog, GuidedTour (react-joyride),
 * and QuickStartChecklist from blocking E2E tests.
 *
 * Also enables developer mode so UI terms match English selectors
 * (e.g., "Conflicts" instead of "冲突").
 *
 * Usage: import { test, expect } from './fixtures/test' instead of '@playwright/test'
 */

import { test as base, expect } from '@playwright/test';

const test = base.extend({
  page: async ({ page }, use) => {
    // addInitScript runs before any page JS on every new document/navigation
    await page.addInitScript(() => {
      // Suppress WelcomeModal
      localStorage.setItem('t3x-onboarding-seen', 'true');
      // Suppress OnboardingDialog (experience level picker)
      localStorage.setItem('t3x-onboarding-experience-set', 'true');
      // Suppress GuidedTour (react-joyride overlay)
      localStorage.setItem('t3x-tour-completed', 'true');
      // Suppress QuickStartChecklist
      localStorage.setItem('t3x-quickstart-dismissed', 'true');
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
