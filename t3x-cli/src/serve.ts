#!/usr/bin/env node
/**
 * Standalone T3X Server
 *
 * Run the API server independently of the CLI shell.
 *
 * Usage:
 *   t3x-serve                    # Default port 8000
 *   t3x-serve --port 8100        # Custom port
 *   t3x-serve --host 0.0.0.0     # Public access
 *
 * Environment variables:
 *   PORT                  - Server port (default: 8000)
 *   HOST                  - Server host (default: 127.0.0.1)
 *   ANTHROPIC_API_KEY     - Required for LLM features
 *   GOOGLE_AI_STUDIO_KEY  - Required for embeddings
 *   GOOGLE_CLOUD_NLP_KEY  - Required for NLP extraction
 *   HTTPS_PROXY / HTTP_PROXY - Proxy for external API calls
 *
 * Config file (~/.config/t3x/config.json):
 *   proxyUrl              - Proxy URL for external API calls
 */

// Setup proxy from config file BEFORE global-agent bootstrap
// This must be synchronous to work with global-agent
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const configPath = join(homedir(), ".config", "t3x", "config.json");
if (existsSync(configPath)) {
  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    const proxyUrl =
      process.env.HTTPS_PROXY ??
      process.env.HTTP_PROXY ??
      config.proxyUrl;
    if (proxyUrl) {
      process.env.GLOBAL_AGENT_HTTP_PROXY = proxyUrl;
      process.env.GLOBAL_AGENT_HTTPS_PROXY = proxyUrl;
      if (!process.env.HTTP_PROXY) process.env.HTTP_PROXY = proxyUrl;
      if (!process.env.HTTPS_PROXY) process.env.HTTPS_PROXY = proxyUrl;
    }
  } catch {
    // Ignore config read errors at this stage
  }
}

// Enable proxy support for Node.js fetch
// Must be imported after proxy env vars are set
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("global-agent/bootstrap");

import { createServer } from "./server/index";
import { loadAppPreferences, checkLegacyConfig } from "./core/config";
import { resolveStorageRoot, detectLegacyStorageDirs, openDB } from "@t3x/core";
import { ProviderConfig } from "./server/types";

// Parse command line arguments
function parseArgs(): { port: number; host: string } {
  const args = process.argv.slice(2);
  let port = parseInt(process.env.PORT ?? "8000", 10);
  let host = process.env.HOST ?? "127.0.0.1";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--port" || arg === "-p") {
      const value = args[++i];
      if (value) {
        const parsed = parseInt(value, 10);
        if (!isNaN(parsed)) port = parsed;
      }
    } else if (arg === "--host" || arg === "-h") {
      const value = args[++i];
      if (value) host = value;
    } else if (arg === "--help") {
      console.log(`
T3X Server

Usage:
  t3x-serve [options]

Options:
  --port, -p <port>    Port to listen on (default: 8000)
  --host, -h <host>    Host to bind to (default: 127.0.0.1)
  --help               Show this help message

Environment Variables:
  PORT                  Server port
  HOST                  Server host
  ANTHROPIC_API_KEY     Required for LLM features (chat, drafts)
  GOOGLE_AI_STUDIO_KEY  Required for embeddings
  GOOGLE_CLOUD_NLP_KEY  Required for NLP extraction
`);
      process.exit(0);
    }
  }

  return { port, host };
}

async function main(): Promise<void> {
  const { port, host } = parseArgs();

  console.log("T3X Server starting...");

  // Resolve storage root using @t3x/core
  // Priority: T3X_ROOT env > discover .t3x/ > create at repo root
  const storageRoot = resolveStorageRoot();
  const t3xDir = storageRoot.t3xDir;

  console.log(`  Project root: ${storageRoot.projectRoot}`);
  console.log(`  Data directory: ${t3xDir}`);
  console.log(`  Source: ${storageRoot.source}`);

  // Detect legacy .t3x directories in subpackages
  const legacyDirs = detectLegacyStorageDirs(storageRoot.projectRoot);
  if (legacyDirs.length > 0) {
    console.warn("\n  Warning: Found legacy .t3x directories:");
    legacyDirs.forEach(d => console.warn(`    - ${d}`));
    console.warn(`  Consider migrating data to: ${t3xDir}\n`);
  }

  // Initialize database
  try {
    const dbPath = openDB(storageRoot.projectRoot);
    console.log(`  Database: ${dbPath}`);
  } catch (error) {
    console.error(`Error: Failed to open database: ${(error as Error).message}`);
    process.exit(1);
  }

  // Check for legacy config location and warn user
  await checkLegacyConfig();

  // Load user preferences
  const preferences = await loadAppPreferences();

  // Build provider config
  const providers: ProviderConfig = {
    embeddingProvider: preferences.embeddingProvider,
    nlpProvider: preferences.nlpProvider,
    googleAIStudioKey: preferences.googleAIStudioKey,
    googleCloudNLPKey: preferences.googleCloudNLPKey,
    anthropicApiKey: preferences.anthropicApiKey,
    defaultLanguage: preferences.defaultLanguage,
  };

  // Show proxy status
  const activeProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (activeProxy) {
    console.log(`  Proxy: ${activeProxy}`);
  }

  // Warn about missing API keys
  if (!providers.anthropicApiKey) {
    console.warn("  Warning: ANTHROPIC_API_KEY not set - LLM features will be unavailable");
  }
  if (!providers.googleAIStudioKey) {
    console.warn("  Warning: GOOGLE_AI_STUDIO_KEY not set - embedding features will be unavailable");
  }
  if (!providers.googleCloudNLPKey) {
    console.warn("  Warning: GOOGLE_CLOUD_NLP_KEY not set - NLP extraction will be unavailable");
  }

  // Create and start server
  const server = createServer({
    port,
    host,
    providers,
    t3xDir,
  });

  try {
    await server.start();
    console.log(`\nT3X Server running at http://${host}:${port}`);
    console.log("\nAvailable endpoints:");
    console.log("  GET  /health                    - Health check");
    console.log("  GET  /api/v1/status             - System status");
    console.log("  GET  /api/v1/projects           - List projects");
    console.log("  POST /api/v1/projects           - Create project");
    console.log("  GET  /api/v1/conversations      - List conversations");
    console.log("  GET  /api/v1/turns              - List turns");
    console.log("  POST /api/v1/turns              - Create turn");
    console.log("  GET  /api/v1/branches           - List branches");
    console.log("  GET  /api/v1/commits            - List commits");
    console.log("  POST /api/v1/commits            - Create commit");
    console.log("  POST /api/v1/agent/drafts       - Create LLM draft");
    console.log("  POST /api/v1/chat               - Chat (non-streaming)");
    console.log("  POST /api/v1/chat/stream        - Chat (SSE streaming)");
    console.log("  GET  /api/v1/export/cfpack      - Export as .cfpack");
    console.log("  GET  /api/v1/export/ledger      - Export as JSONL");
    console.log("\nPress Ctrl+C to stop.");

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log("\nShutting down...");
      await server.stop();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error(`Error: Failed to start server: ${(error as Error).message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
