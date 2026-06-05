#!/usr/bin/env node

import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = 'tmp/screenshots/demo';
const CHAT_SIDEBAR_COLLAPSED_WIDTH = 64;
const requireFromWeb = createRequire(path.join(REPO_ROOT, 'apps/web/package.json'));

export function getScreenshotTargets() {
  return [
    {
      name: 'chat-light',
      outputPath: `${OUTPUT_DIR}/chat-light.png`,
      viewport: { width: 1440, height: 980 },
      theme: 'light',
      colorScheme: 'light',
      settleMs: 500,
    },
    {
      name: 'chat-dark',
      outputPath: `${OUTPUT_DIR}/chat-dark.png`,
      viewport: { width: 1440, height: 980 },
      theme: 'dark',
      colorScheme: 'dark',
      settleMs: 500,
    },
    {
      name: 'chat-mobile',
      outputPath: `${OUTPUT_DIR}/chat-mobile.png`,
      viewport: { width: 390, height: 844 },
      theme: 'light',
      colorScheme: 'light',
      settleMs: 500,
      waitForCollapsedSidebar: true,
    },
  ];
}

export function resolveScreenshotConfig(env = process.env) {
  const baseUrl = (env.WEBUI_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return {
    baseUrl,
    url: `${baseUrl}/chat`,
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
      await page
        .getByRole('heading', { name: 'What should T3X make sense of?' })
        .waitFor({ timeout: 15_000 });
      if (target.waitForCollapsedSidebar) {
        await page.waitForFunction(
          (collapsedWidth) => {
            const sidebar = document.querySelector('aside[aria-label="Chat navigation"]');
            if (!sidebar) return false;
            const width = Number.parseFloat(window.getComputedStyle(sidebar).width);
            return width <= collapsedWidth + 1;
          },
          CHAT_SIDEBAR_COLLAPSED_WIDTH,
          { timeout: 5_000 }
        );
      }
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
