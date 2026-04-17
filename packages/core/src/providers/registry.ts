/**
 * Provider Registry
 *
 * Central registry for managing LLM and Embedding providers.
 * Supports role-based assignment, fallback chains, and runtime configuration.
 */

import type { LLMProvider } from '../llm/types';
import type { EmbeddingProvider } from './embedding/base';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export type ProviderRole = 'generation' | 'embedding' | 'merge';

export type AnyProvider = LLMProvider | EmbeddingProvider;

export interface ProviderEntry<T = AnyProvider> {
  /** Unique provider ID, e.g., "anthropic", "openai", "ollama" */
  id: string;
  /** Display name */
  name: string;
  /** What role this provider can serve */
  role: ProviderRole;
  /** Factory function to create the provider instance */
  factory: (config: ResolvedConfig) => T;
  /** Environment variable keys required for this provider */
  requiredEnvKeys: string[];
  /** Default model for this provider */
  defaultModel?: string;
  /** Available models for this provider */
  availableModels?: string[];
}

export interface ResolvedConfig {
  [key: string]: string | undefined;
}

export interface RoleAssignment {
  role: ProviderRole;
  providerIds: string[];
}

export interface RegistryConfig {
  roles: RoleAssignment[];
}

export interface TestConnectionResult {
  ok: boolean;
  error?: string;
  latencyMs?: number;
}

/** Error codes that indicate a transient failure worth retrying with a different provider. */
const RETRYABLE_ERROR_CODES = new Set([
  'RATE_LIMIT',
  'OVERLOADED',
  'NETWORK_ERROR',
  'SERVER_ERROR',
]);

/** Error thrown when all providers in a fallback chain fail. */
export class AllProvidersFailedError extends Error {
  constructor(
    public readonly role: ProviderRole,
    public readonly errors: Array<{ providerId: string; error: unknown }>
  ) {
    const summary = errors
      .map(
        (e) => `${e.providerId}: ${e.error instanceof Error ? e.error.message : String(e.error)}`
      )
      .join('; ');
    super(`All providers failed for role "${role}": ${summary}`);
    this.name = 'AllProvidersFailedError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════════════════════

export class ProviderRegistry {
  private entries = new Map<string, ProviderEntry>();
  private instances = new Map<string, AnyProvider>();
  private roleAssignments = new Map<ProviderRole, string[]>();
  private configOverrides: ResolvedConfig = {};

  /**
   * Set runtime config overrides.
   * Overrides take precedence over process.env for provider factories.
   */
  setConfigOverrides(overrides: ResolvedConfig): void {
    this.configOverrides = { ...overrides };
    this.instances.clear();
  }

  /**
   * Register a provider entry.
   */
  register<T extends AnyProvider>(entry: ProviderEntry<T>): void {
    this.entries.set(entry.id, entry as ProviderEntry);
    // If no role assignment exists for this role, add as default
    if (!this.roleAssignments.has(entry.role)) {
      this.roleAssignments.set(entry.role, [entry.id]);
    }
  }

  /**
   * Get the default provider for a role.
   * Returns the first configured provider in the role's assignment chain.
   */
  getForRole<T extends AnyProvider>(role: ProviderRole): T | null {
    const ids = this.roleAssignments.get(role);
    if (!ids || ids.length === 0) return null;

    for (const id of ids) {
      const instance = this.getInstance<T>(id);
      if (instance) return instance;
    }
    return null;
  }

  /**
   * Get a provider by its ID.
   */
  getById<T extends AnyProvider>(id: string): T | null {
    return this.getInstance<T>(id);
  }

  /**
   * Get provider with fallback chain for a given role.
   * Tries each provider in the role's assignment order.
   */
  getWithFallback<T extends AnyProvider>(role: ProviderRole): T | null {
    return this.getForRole<T>(role);
  }

  /**
   * Try an operation with fallback across all providers assigned to a role.
   * On retryable errors (RATE_LIMIT, OVERLOADED, NETWORK_ERROR, SERVER_ERROR),
   * automatically tries the next provider. Non-retryable errors throw immediately.
   */
  async tryWithFallback<T extends AnyProvider, R>(
    role: ProviderRole,
    fn: (provider: T) => Promise<R>
  ): Promise<R> {
    const ids = this.roleAssignments.get(role);
    if (!ids || ids.length === 0) {
      throw new AllProvidersFailedError(role, [
        { providerId: '(none)', error: new Error('No providers assigned to role') },
      ]);
    }

    const errors: Array<{ providerId: string; error: unknown }> = [];

    for (const id of ids) {
      const instance = this.getInstance<T>(id);
      if (!instance) {
        errors.push({
          providerId: id,
          error: new Error(`Provider not configured (missing environment variables)`),
        });
        continue;
      }

      try {
        return await fn(instance);
      } catch (error) {
        const code = isErrorWithCode(error) ? error.code : '';
        // Non-retryable errors: throw immediately
        if (code && !RETRYABLE_ERROR_CODES.has(code)) {
          throw error;
        }
        errors.push({ providerId: id, error });
        // Brief backoff before trying next provider (100ms * attempt number)
        if (ids.indexOf(id) < ids.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100 * (ids.indexOf(id) + 1)));
        }
      }
    }

    throw new AllProvidersFailedError(role, errors);
  }

  /**
   * Assign providers to a role in priority order.
   */
  assignRole(role: ProviderRole, providerIds: string[]): void {
    // Verify all IDs are registered
    for (const id of providerIds) {
      if (!this.entries.has(id)) {
        throw new Error(`Provider "${id}" is not registered`);
      }
    }
    this.roleAssignments.set(role, providerIds);
    // Clear cached instances for this role's providers
    for (const id of providerIds) {
      this.instances.delete(id);
    }
  }

  /**
   * Check if a provider has all required env keys set.
   */
  isConfigured(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    if (entry.requiredEnvKeys.length === 0) return true;
    const config = this.getResolvedConfig(entry);
    return entry.requiredEnvKeys.every((key) => Boolean(config[key]));
  }

  /**
   * Test a provider's connection by trying a minimal operation.
   */
  async testConnection(id: string): Promise<TestConnectionResult> {
    const entry = this.entries.get(id);
    if (!entry) {
      return { ok: false, error: `Provider "${id}" is not registered` };
    }

    if (!this.isConfigured(id)) {
      const config = this.getResolvedConfig(entry);
      const missing = entry.requiredEnvKeys.filter((key) => !config[key]);
      return { ok: false, error: `Missing environment variables: ${missing.join(', ')}` };
    }

    const start = Date.now();
    try {
      const instance = this.getInstance(id);
      if (!instance) {
        return { ok: false, error: 'Failed to create provider instance' };
      }

      // Test based on provider type
      if ('generate' in instance) {
        // LLM provider — send a minimal prompt
        await (instance as LLMProvider).generate('Say "ok"', { maxTokens: 5, temperature: 0 });
      } else if ('encode' in instance) {
        // Embedding provider — encode a test string
        await (instance as EmbeddingProvider).encode(['test']);
      }

      return { ok: true, latencyMs: Date.now() - start };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - start,
      };
    }
  }

  /**
   * List all registered providers with their configuration status.
   */
  listProviders(): Array<ProviderEntry & { configured: boolean; roles: ProviderRole[] }> {
    const result: Array<ProviderEntry & { configured: boolean; roles: ProviderRole[] }> = [];
    for (const entry of this.entries.values()) {
      const assignedRoles: ProviderRole[] = [];
      for (const [role, ids] of this.roleAssignments.entries()) {
        if (ids.includes(entry.id)) {
          assignedRoles.push(role);
        }
      }
      result.push({
        ...entry,
        configured: this.isConfigured(entry.id),
        roles: assignedRoles,
      });
    }
    return result;
  }

  /**
   * Export the current role assignments as config.
   */
  exportConfig(): RegistryConfig {
    const roles: RoleAssignment[] = [];
    for (const [role, providerIds] of this.roleAssignments.entries()) {
      roles.push({ role, providerIds });
    }
    return { roles };
  }

  /**
   * Import role assignments from config.
   */
  importConfig(config: RegistryConfig): void {
    for (const { role, providerIds } of config.roles) {
      // Only assign providers that are actually registered
      const validIds = providerIds.filter((id) => this.entries.has(id));
      if (validIds.length > 0) {
        this.roleAssignments.set(role, validIds);
      }
    }
    // Clear all cached instances
    this.instances.clear();
  }

  /**
   * Auto-configure role assignments based on which providers have env keys set.
   * Called at startup to set sensible defaults.
   */
  autoConfigureFromEnv(): void {
    const roleProviders = new Map<ProviderRole, string[]>();

    for (const entry of this.entries.values()) {
      if (this.isConfigured(entry.id)) {
        const existing = roleProviders.get(entry.role) ?? [];
        existing.push(entry.id);
        roleProviders.set(entry.role, existing);
      }
    }

    for (const [role, providerIds] of roleProviders.entries()) {
      // Only set if no explicit assignment exists
      if (!this.roleAssignments.has(role) || this.roleAssignments.get(role)?.length === 0) {
        this.roleAssignments.set(role, providerIds);
      }
    }
  }

  /**
   * Get the provider entry (metadata) by ID.
   */
  getEntry(id: string): ProviderEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * Resolve a model string like "openai:gpt-4o" to a provider + model.
   */
  resolveModel(modelSpec: string): { provider: AnyProvider; model: string } | null {
    // Format: "providerId:modelName" or just "modelName"
    const colonIdx = modelSpec.indexOf(':');
    if (colonIdx > 0) {
      const providerId = modelSpec.slice(0, colonIdx);
      const model = modelSpec.slice(colonIdx + 1);
      const instance = this.getInstance(providerId);
      if (instance) return { provider: instance, model };
    }

    // Search all providers for the model name
    for (const entry of this.entries.values()) {
      if (entry.availableModels?.includes(modelSpec) || entry.defaultModel === modelSpec) {
        const instance = this.getInstance(entry.id);
        if (instance) return { provider: instance, model: modelSpec };
      }
    }

    return null;
  }

  /**
   * Clear all cached instances (forces re-creation on next access).
   */
  clearInstances(): void {
    this.instances.clear();
  }

  // ─── Private ───────────────────────────────────────────────────────────

  /** Get the list of provider IDs assigned to a role (returns a copy). */
  getProviderIdsForRole(role: ProviderRole): string[] {
    return [...(this.roleAssignments.get(role) ?? [])];
  }

  private getResolvedConfig(entry: ProviderEntry): ResolvedConfig {
    const config: ResolvedConfig = { ...this.configOverrides };
    for (const key of entry.requiredEnvKeys) {
      if (config[key] === undefined) {
        config[key] = typeof process !== 'undefined' ? process.env?.[key] : undefined;
      }
    }
    return config;
  }

  private getInstance<T extends AnyProvider>(id: string): T | null {
    // Return cached instance
    if (this.instances.has(id)) {
      return this.instances.get(id) as T;
    }

    const entry = this.entries.get(id);
    if (!entry) return null;

    // Check env keys
    if (!this.isConfigured(id)) return null;

    const config = this.getResolvedConfig(entry);

    try {
      const instance = entry.factory(config) as AnyProvider;
      this.instances.set(id, instance);
      return instance as T;
    } catch (error) {
      console.warn(
        `[ProviderRegistry] Failed to create provider "${id}":`,
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
  }
}

/**
 * Create a new ProviderRegistry instance.
 */
export function createProviderRegistry(): ProviderRegistry {
  return new ProviderRegistry();
}

/** Type guard for errors that carry a `code` property (e.g. GenerationError). */
function isErrorWithCode(error: unknown): error is Error & { code: string } {
  return error instanceof Error && typeof (error as { code?: unknown }).code === 'string';
}
