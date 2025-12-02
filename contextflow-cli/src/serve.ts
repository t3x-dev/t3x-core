#!/usr/bin/env node
/**
 * Standalone ContextFlow Server
 *
 * Run the API server independently of the CLI shell.
 *
 * Usage:
 *   contextflow-serve                    # Default port 8000
 *   contextflow-serve --port 8100        # Custom port
 *   contextflow-serve --host 0.0.0.0     # Public access
 *
 * Environment variables:
 *   PORT                  - Server port (default: 8000)
 *   HOST                  - Server host (default: 127.0.0.1)
 *   ANTHROPIC_API_KEY     - Required for LLM features
 *   GOOGLE_AI_STUDIO_KEY  - Required for embeddings
 *   GOOGLE_CLOUD_NLP_KEY  - Required for NLP extraction
 */

import { createServer } from "./server/index";
import { loadAppPreferences } from "./core/config";
import { discoverProjectRoot } from "./core/root";
import { openDB } from "./core/db";
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
ContextFlow Server

Usage:
  contextflow-serve [options]

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

  console.log("ContextFlow Server starting...");

  // Discover project root for .contextflow directory
  let contextflowDir: string;
  try {
    const root = await discoverProjectRoot(process.cwd());
    contextflowDir = root.contextflowDir;
    console.log(`  Project root: ${root.projectRoot}`);
    console.log(`  Data directory: ${contextflowDir}`);
  } catch (error) {
    console.error("Error: Could not find .contextflow directory.");
    console.error("Please run this command from within a contextflow project.");
    process.exit(1);
  }

  // Initialize database
  try {
    const dbPath = openDB(contextflowDir.replace("/.contextflow", ""));
    console.log(`  Database: ${dbPath}`);
  } catch (error) {
    console.error(`Error: Failed to open database: ${(error as Error).message}`);
    process.exit(1);
  }

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
    contextflowDir,
  });

  try {
    await server.start();
    console.log(`\nContextFlow Server running at http://${host}:${port}`);
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
