# MCP Agent Guide

Follow the [repository guide](../../AGENTS.md). `apps/mcp` owns the runnable stdio entry point and runtime configuration. `packages/mcp` owns the server, tool definitions, handlers, resources, and prompts. Write MCP documentation and agent guidance in English.

## Before changing MCP

- Read the [MCP README](README.md) for setup and existing toolsets. Use the [business capability inventory](docs/business-capabilities.md) for proposed tool groups, current coverage, and the single-user workflow.
- Reuse the API client and the owning application commands. Follow [Request Principal](../../docs/architecture/request-principal-migration-baseline.md) for identity, [Reliable Workspace](../../docs/architecture/reliable-workspace-gate-1.md) for Draft ownership and concurrency, and [Transition Application Convergence](../../docs/architecture/transition-application-convergence.md) for Review and Commit.
- Pass the credential through the API client. Keep actor, delegation, grants, Workspace ownership, policy, and mutation authority server-owned. Preserve request IDs and exact revisions, Review preconditions, and ref heads on guarded writes. Use the authenticated API path for user and Agent workflows.
- Keep the current registry and proposed tool groups distinct in docs. Check the handler, required backend, and authority checks before listing a capability as supported. Identify reusable API commands separately from Web Chat behavior.

## Verification

- For documentation changes, follow the [repository verification policy](../../AGENTS.md#verification) and check links and Mermaid syntax where applicable.
- For tool or server changes, run the relevant tests for `@t3x-dev/mcp-lib` and `@t3x-dev/mcp`. Exercise the stdio entry point for changes to tool discovery, configuration, or transport. Treat authenticated workflow acceptance as a separate check using the relevant API credential and ref policy.
