#!/usr/bin/env node

import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = 'tmp/screenshots/demo';
const requireFromWeb = createRequire(path.join(REPO_ROOT, 'apps/web/package.json'));

export function getScreenshotTargets() {
  return [
    {
      name: 'repository-light',
      outputPath: `${OUTPUT_DIR}/repository-light.png`,
      viewport: { width: 1440, height: 980 },
      theme: 'light',
      colorScheme: 'light',
      settleMs: 500,
    },
    {
      name: 'repository-dark',
      outputPath: `${OUTPUT_DIR}/repository-dark.png`,
      viewport: { width: 1440, height: 980 },
      theme: 'dark',
      colorScheme: 'dark',
      settleMs: 500,
    },
    {
      name: 'repository-mobile',
      outputPath: `${OUTPUT_DIR}/repository-mobile.png`,
      viewport: { width: 390, height: 844 },
      theme: 'light',
      colorScheme: 'light',
      settleMs: 500,
    },
  ];
}

export function resolveScreenshotConfig(env = process.env) {
  const baseUrl = (env.WEBUI_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return {
    baseUrl,
    url: `${baseUrl}/`,
    outputDir: OUTPUT_DIR,
  };
}

export async function captureDemoScreenshots(env = process.env) {
  const { chromium } = requireFromWeb('@playwright/test');
  const config = resolveScreenshotConfig(env);
  const browser = await chromium.launch();

  await mkdir(path.join(REPO_ROOT, config.outputDir), { recursive: true });

  try {
    for (const target of getScreenshotTargets()) {
      const context = await browser.newContext({
        viewport: target.viewport,
        colorScheme: target.colorScheme,
      });
      await context.addInitScript((theme) => {
        window.localStorage.setItem('theme', theme);
      }, target.theme);

      const page = await context.newPage();
      await page.goto(config.url, { waitUntil: 'domcontentloaded' });
      await page.evaluate((theme) => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
      }, target.theme);
      await page.getByRole('heading', { name: 't3x-dev' }).waitFor({ timeout: 15_000 });
      await page.waitForTimeout(target.settleMs);
      await page.screenshot({
        path: path.join(REPO_ROOT, target.outputPath),
        fullPage: true,
      });
      await context.close();
      console.log(`wrote ${target.outputPath}`);
    }
  } finally {
    await browser.close();
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  captureDemoScreenshots().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
