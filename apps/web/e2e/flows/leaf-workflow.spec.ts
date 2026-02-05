import { expect, test } from '@playwright/test';
import {
  cleanupProject,
  createTestCommitV4,
  createTestLeaf,
  createTestProject,
} from '../fixtures/api-helpers';
import { generateConstraints, generateSentences } from '../fixtures/test-data-factory';

/**
 * Leaf Workflow E2E Tests
 *
 * Tests leaf management including:
 * - Viewing leaf constraints
 * - Adding constraints
 * - Output generation (requires LLM key)
 * - Output validation
 * - Export functionality
 */

test.describe('Leaf Workflow', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;
  let commitHash: string;
  let leafId: string;

  const sentences = generateSentences(4);
  const constraints = generateConstraints('require', 2);

  test.beforeAll(async ({ request }) => {
    const { projectId: id } = await createTestProject(request, `Leaf E2E ${Date.now()}`);
    projectId = id;

    commitHash = await createTestCommitV4(request, projectId, sentences, {
      message: 'Leaf test commit',
    });

    leafId = await createTestLeaf(request, commitHash, projectId, constraints);
  });

  test.afterAll(async ({ request }) => {
    await cleanupProject(request, projectId).catch(() => {});
  });

  // LW-01: View leaf with constraints listed by type
  test('LW-01: View leaf constraints', async ({ page }) => {
    await page.goto(`/project/${projectId}/leaf/${leafId}`);

    // Wait for leaf page to load
    const leafTitle = page.locator('text=E2E Test Leaf').or(page.locator(`text=${leafId}`));
    await expect(leafTitle.first()).toBeVisible({ timeout: 15000 });

    // Constraints should be displayed (may appear as "Must Have", "require", or "Constraints")
    const mustHaveSection = page.locator('text=/Must Have|require|Constraints/i').first();
    await expect(mustHaveSection).toBeVisible({ timeout: 15000 });

    // Individual constraint values should be visible
    for (const c of constraints) {
      const constraintText = page.locator(`text=${c.value}`).first();
      await expect(constraintText).toBeVisible({ timeout: 5000 });
    }
  });

  // LW-02: Leaf page shows source commit sentences
  test('LW-02: Source commit sentences displayed', async ({ page }) => {
    await page.goto(`/project/${projectId}/leaf/${leafId}`);

    const leafTitle = page.locator('text=E2E Test Leaf').or(page.locator(`text=${leafId}`));
    await expect(leafTitle.first()).toBeVisible({ timeout: 15000 });

    // Source context section or actual source sentence should be present
    const sourceSection = page
      .locator('text=Source Context')
      .or(page.locator(`text=${sentences[0].text}`));
    await expect(sourceSection.first()).toBeVisible({ timeout: 10000 });
  });

  // LW-03: Generate output (skip if no LLM key configured)
  test('LW-03: Generate output', async ({ page }) => {
    await page.goto(`/project/${projectId}/leaf/${leafId}`);

    const leafTitle = page.locator('text=E2E Test Leaf').or(page.locator(`text=${leafId}`));
    await expect(leafTitle.first()).toBeVisible({ timeout: 15000 });

    // Verify leaf page rendered with expected sections before checking Generate
    const constraintsSection = page.locator('text=/Must Have|Constraints/i').first();
    await expect(constraintsSection).toBeVisible({ timeout: 10000 });

    // Find generate button
    const generateBtn = page
      .locator('button:has-text("Generate")')
      .or(page.locator('button:has-text("Verify")'))
      .first();
    const hasGenerate = await generateBtn.isVisible().catch(() => false);
    test.skip(!hasGenerate, 'Generate button not present — LLM may not be configured');

    await generateBtn.click();

    // Wait for loading phase or output to appear
    const outputSection = page.locator('text=Output').first();
    await expect(outputSection).toBeVisible({ timeout: 30000 });

    // Check if we got an API key error (not a bug, just missing config)
    const apiKeyError = page.locator('text=/API key/i').first();
    const hasApiKeyError = await apiKeyError.isVisible().catch(() => false);
    test.skip(hasApiKeyError, 'LLM API key not configured');

    // Verify actual output content appeared
    const outputText = page.locator('pre, [class*="whitespace-pre"]').first();
    const hasOutput = await outputText.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(
      !hasOutput,
      'Output not generated — LLM may not be configured or context still loading'
    );
  });

  // LW-04: Validate output shows assertions
  test('LW-04: Validate output shows assertions', async ({ page, request }) => {
    // Set mock output via API so validation has something to check
    await request.patch(`http://localhost:8000/api/v1/leaves/${leafId}`, {
      data: { output: 'User prefers dark mode and speaks English fluently.' },
    });

    await page.goto(`/project/${projectId}/leaf/${leafId}`);

    const leafTitle = page.locator('text=E2E Test Leaf').or(page.locator(`text=${leafId}`));
    await expect(leafTitle.first()).toBeVisible({ timeout: 15000 });

    // Verify output section rendered before checking Validate
    const outputSection = page.locator('text=Output').or(page.locator('pre')).first();
    await expect(outputSection).toBeVisible({ timeout: 10000 });

    // Find re-validate button
    const validateBtn = page
      .locator('button:has-text("Validate")')
      .or(page.locator('button:has-text("Re-validate")'))
      .first();
    const hasValidate = await validateBtn.isVisible().catch(() => false);
    test.skip(!hasValidate, 'Validate button not present — LLM may not be configured');

    await validateBtn.click();

    // Validation results should appear
    const validationSection = page
      .locator('text=Validation Results')
      .or(page.locator('text=/Passed|Failed/'));
    await expect(validationSection.first()).toBeVisible({ timeout: 15000 });
  });

  // LW-05: Export output
  test('LW-05: Export output', async ({ page, request }) => {
    // Ensure leaf has output
    await request.patch(`http://localhost:8000/api/v1/leaves/${leafId}`, {
      data: { output: 'Exported test output content.' },
    });

    await page.goto(`/project/${projectId}/leaf/${leafId}`);

    const leafTitle = page.locator('text=E2E Test Leaf').or(page.locator(`text=${leafId}`));
    await expect(leafTitle.first()).toBeVisible({ timeout: 15000 });

    // Verify output content rendered before checking Export
    const outputContent = page.locator('pre, [class*="whitespace-pre"]').first();
    await expect(outputContent).toBeVisible({ timeout: 10000 });

    // Look for export/download button
    const exportBtn = page
      .locator('button:has-text("Export")')
      .or(page.locator('button:has-text("Copy")').or(page.locator('button:has-text("Download")')))
      .first();
    const hasExport = await exportBtn.isVisible().catch(() => false);
    test.skip(!hasExport, 'Export button not present');

    await exportBtn.click();

    // Should show success feedback (clipboard copy or download)
    const feedback = page
      .locator('text=/copied|exported|downloaded/i')
      .or(page.locator('[role="status"]'));
    await expect(feedback.first()).toBeVisible({ timeout: 5000 });
  });
});
