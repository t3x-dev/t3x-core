/**
 * Server Manager
 *
 * Manages the embedded API server lifecycle.
 * Provides functions to start/stop the server and get server info.
 */

import { createServer, Server } from "./index";
import { ServerConfig, ProviderConfig } from "./types";
import { loadAppPreferences } from "../core/config";
import { resolveStorageRoot, openDB } from "@t3x/core";

/**
 * Server manager state
 */
interface ServerState {
  server: Server | null;
  config: ServerConfig | null;
}

const state: ServerState = {
  server: null,
  config: null,
};

/**
 * Start the embedded API server
 *
 * @param options - Server options
 * @returns Server address if started successfully
 */
export async function startEmbeddedServer(options?: {
  port?: number;
  host?: string;
}): Promise<{ host: string; port: number }> {
  // Already running?
  if (state.server) {
    const addr = state.server.address();
    if (addr) {
      return addr;
    }
  }

  // Resolve storage root using @t3x/core
  const storageRoot = resolveStorageRoot();
  await openDB(storageRoot.projectRoot);

  // Load user preferences with proper provider configuration
  const preferences = await loadAppPreferences();

  const providers: ProviderConfig = {
    embeddingProvider: preferences.embeddingProvider,
    nlpProvider: preferences.nlpProvider,
    googleAIStudioKey: preferences.googleAIStudioKey,
    googleCloudNLPKey: preferences.googleCloudNLPKey,
    anthropicApiKey: preferences.anthropicApiKey,
    defaultLanguage: preferences.defaultLanguage,
  };

  const config: ServerConfig = {
    port: options?.port ?? 8000,
    host: options?.host ?? "127.0.0.1",
    providers,
    t3xDir: storageRoot.t3xDir,
  };

  const server = createServer(config);
  await server.start();

  state.server = server;
  state.config = config;

  return server.address()!;
}

/**
 * Stop the embedded API server
 */
export async function stopEmbeddedServer(): Promise<void> {
  if (!state.server) {
    return;
  }

  await state.server.stop();
  state.server = null;
  state.config = null;
}

/**
 * Get embedded server info
 */
export function getEmbeddedServerInfo(): { host: string; port: number } | null {
  if (!state.server) {
    return null;
  }
  return state.server.address();
}

/**
 * Check if embedded server is running
 */
export function isEmbeddedServerRunning(): boolean {
  return state.server !== null && state.server.address() !== null;
}

/**
 * Get the embedded server URL
 */
export function getEmbeddedServerUrl(): string | null {
  const info = getEmbeddedServerInfo();
  if (!info) {
    return null;
  }
  return `http://${info.host}:${info.port}`;
}
