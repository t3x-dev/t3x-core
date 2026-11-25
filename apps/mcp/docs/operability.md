# T3X MCP Operability and Qualification

This document defines the target requirements for diagnosing failures, recovering interrupted operations, and qualifying the nine groups in the [business capability inventory](business-capabilities.md). The initial scope is the local stdio entry point with an authentication-enabled T3X API.

The current TypeScript SDK v1 implements protocol revisions through `2025-11-25`. The stdio entry point correlates tool calls and downstream HTTP requests and includes safe references in tool errors. The qualification client collects selected `stderr` events. Recovery guarantees apply to each command's documented contract. Full business coverage and third-party host behavior require separate qualification. [MCP SDK v1](https://ts.sdk.modelcontextprotocol.io/) · [Tool dispatch](../../../packages/mcp/src/server.ts) · [API client](../../../packages/api-client/src/client.ts) · [Qualification client](../../web/e2e/fixtures/mcp-qualification.ts)

## Ownership

- The application and API own command behavior, authorization, concurrency checks, idempotency, and durable business results. MCP forwards credentials and exact operation preconditions through the API client and adapts the results. The API checks authorization on recovery reads and repeated writes. [Request Principal](../../../docs/architecture/request-principal-migration-baseline.md) · [Transition Application Convergence](../../../docs/architecture/transition-application-convergence.md)
- The host owns the user-facing task status and requests for human action. The qualification runner owns scenario status, evidence collection, and coverage reporting. Keep these decisions in the host or runner so they can also handle a process crash or lost connection.

## Call outcomes and errors

| Outcome | Required handling |
| --- | --- |
| Process or transport failure | The host records launch failures, exits, disconnects, and timeouts, with the exit code or signal when available. A write with a lost response has an unconfirmed result until checked. |
| Protocol error | Use JSON-RPC errors for unknown tools, malformed protocol requests, and other protocol failures. Validate compatibility when correcting the current unknown-tool mapping. |
| Tool execution error | Return `isError: true` for errors such as invalid tool arguments, a disabled action on a known tool, an authorization denial, a stale Review, or an upstream failure. Include an actionable reason when it can be disclosed. |
| Business outcome | Return the authoritative status and available evidence in the tool result. A valid response can contain a failed Run, a failed Delivery receipt, a verification finding, or a recorded rejection. Evaluate the outcome against the requested operation and expected result. |

Use the MCP error boundary defined by the applicable protocol revision. Keep the existing textual result readable to clients. When adopting `structuredContent` and an output schema, verify compatibility with supported hosts and provide the serialized text representation. [2025-11-25 tool errors](https://modelcontextprotocol.io/specification/2025-11-25/server/tools#error-handling) · [Structured content](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#structured-content)

Use the application or API error code where available. A tool error carries a stable `code`, a safe `message`, and a diagnostic reference where available. Include the downstream HTTP status, approved domain details, and recovery guidance when relevant. Preserve the HTTP status and request ID when an upstream response has an empty or invalid body. Use a generic public message for unexpected exceptions and correlate it with protected diagnostic logs. Callers branch on stable codes and domain reasons. Details must follow an allowlist for the error and the caller's access, including when a denial must conceal the existence of a resource. [API request handling](../../../packages/api-client/src/client.ts) · [Error mapping](../../../packages/mcp/src/tools/transition/index.ts)

## Timeouts and recovery

- Apply bounded timeouts at the host and downstream request boundaries. Propagate cancellation where the operation supports it. For a write interrupted by timeout, cancellation, or disconnect, check persisted state before deciding whether to retry. A lost response leaves the result unconfirmed. [MCP cancellation](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/cancellation)
- Document recovery per write action. Use the original business `request_id` to look up a receipt where supported. Otherwise, read the authoritative result or use an exact replay only where the operation documents that guarantee. Exact replay preserves the caller scope, request key, and input. When recovery cannot establish the result, report the uncertainty and pause the affected write flow for a human decision.
- On a stale Draft, Review, or ref head, read the current revisions and ref. Reconcile when required and prepare a fresh Review when the existing one can no longer be used. Preserve the existing confirmation and authority checks. [Reliable Workspace](../../../docs/architecture/reliable-workspace-gate-1.md)
- Source ingestion supports receipt lookup by request ID. A configured repository Run can recover its Run record with the original request. Treat Commit and Workspace validation triggers according to their own contracts, which currently offer no idempotency guarantee. [Source ingestion](../../../packages/mcp/src/tools/source-ingestion.ts) · [Configured Run](../../../packages/mcp/src/tools/repository-runs.ts) · [Commit validation](../../../packages/mcp/src/tools/commit-validation.ts) · [Workspace validation](../../../packages/mcp/src/tools/workspace-validation.ts)

| Interrupted operation | Read back before attempting another write |
| --- | --- |
| Repository or branch creation | Resolve the intended repository and ref, and check the known ownership and expected basis. |
| Draft, Schema, or candidate write | Read the owned Workspace activity, saved action, and current revisions. Review any intervening edit before proceeding. |
| Verify, Decision, or Commit | Inspect the exact Transition. For a Commit, read `t3x_commit_result` and verify the recorded Commit and separately observed ref head. |
| Delivery | Read the receipt and current preview assignment. For prepare, reuse the original request ID, Workspace revision, and Commit digest as documented. |

The stdio entry point bounds downstream API requests to 60 seconds and propagates MCP cancellation to the fetch. Where a write may have reached the API, tool errors for an unconfirmed result include `write_outcome: "unconfirmed"` in the existing text response. A client-side disconnect can still leave the host without a tool response, so apply the same recovery rule when the host sees a timeout or exit during a write.

Long-running operations should expose durable business IDs and authorized status reads. A supported host may receive request-scoped MCP progress while a call is active. Evaluate the opt-in Tasks extension separately when a supported host needs it. Continue to use the business record for the operation's final state. [MCP progress](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/progress) · [MCP Tasks extension](https://tasks.extensions.modelcontextprotocol.io/specification/2026-07-28/tasks)

## Diagnostics and safe evidence

Reserve stdio `stdout` for protocol messages. Write structured MCP diagnostics to `stderr` and have the qualification client collect a bounded, sanitized record. Record the component, timestamp, tool and action, duration, call outcome, and applicable error code and correlation IDs. Use the process, protocol response, and business result to determine the outcome. MCP Logging notifications are deprecated as of `2026-07-28`. Use W3C Trace Context and OpenTelemetry if a deployment needs distributed tracing. [stdio transport](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio) · [MCP Logging](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/logging) · [W3C Trace Context](https://www.w3.org/TR/trace-context/)

| Identifier | Purpose |
| --- | --- |
| JSON-RPC `id` | Matches a protocol request to its response within the client/server exchange. |
| MCP call ID | Locates one invocation in diagnostics, including failures before the first API request. |
| HTTP `X-Request-Id` | Locates one downstream API request in the API logs. Link each available HTTP ID to the MCP call, including credential preflight and retry attempts. Preserve a reference on failure where available. |
| Business `request_id` or idempotency key | Identifies a logical write across attempts when the command supports idempotency or receipt lookup. |
| Business record ID or digest | Identifies the exact record to read back, such as a Review snapshot, Run, Commit, or Delivery receipt. |

Use field allowlists for logs, assertions, and exported reports. Exclude credentials, cookies, private source or artifact content, and raw request or response bodies. Keep sanitized stack traces and detailed diagnostics in access-controlled logs with bounded retention. Preserve the existing artifact restrictions for credential issuance, including disabled Playwright traces, automatic screenshots, and video. [API request IDs](../../../packages/api/src/middleware/request-id.ts) · [API logging](../../../packages/api/src/middleware/logger.ts) · [Credential test settings](../../web/e2e/security/mcp-core-loop.spec.ts)

## Agent reporting

The host reports an unexpected failure, an unconfirmed write, or a required human action while the task is active. Reuse the existing tool result with `isError: true` and the readable `content[0].text`. The text can include `call_id`, `write_outcome`, and `next_action`. Include the operation, what has been confirmed, a safe reference, and the next action. For example, after losing a Commit response, report that the result is being checked and then update the user with the exact Commit or the remaining uncertainty.

The host records recovered errors and expected negative outcomes in the final summary when they affect the task or its evidence. In qualification, an expected denial passes when the reason and relevant unchanged state match the scenario. Record unexpected failures and continue with independent scenarios when their prerequisites still hold. Validate the behavior of each supported third-party host before promising equivalent user reporting.

## Qualification prerequisites and coverage

1. **Preflight the intended build and isolated stack.** Build MCP from the checkout under test and record its revision, negotiated protocol version, and capability profile. Verify stdio negotiation, API reachability and authentication, credential context, and advertised tools and actions. Check the effective database and service configuration, including environment files loaded by the API. Use isolated test data and credentials. Check the model, Runner, and ref policy prerequisites for each selected scenario. Use explicit fixture endpoints and opt in to real external dependencies for the phases that exercise them. [MCP setup](../README.md) · [API configuration loading](../../api/src/index.ts)
2. **Verify diagnostics and recovery before the full pass.** Cover a revoked credential, a stale Review, a write whose response is lost, a failed business outcome inside a valid tool result, and an MCP process exit. Also check that the captured evidence excludes credentials and private payloads. For an idempotent write, verify that recovery finds the exact result and the operation is recorded once.
3. **Track execution by capability and phase.** Use the isolated full E2E runner and the MCP qualification phases. Maintain a scenario checklist across all nine business groups. For each scenario record the selected phase, credential type, whether dependencies are real or fixtures, actual outcome, and evidence references. Record passed, failed, blocked, and unrun scenarios explicitly. A zero-case phase or an unexpected skip leaves its scenarios unqualified, regardless of the runner exit code. [Full E2E runner](../../../tools/full-e2e.mjs) · [Phase selection](../../web/e2e/security/mcp-core-loop.spec.ts)

The first milestone covers local stdio, the authenticated API, and the qualification client. SDK v2, remote HTTP, Tasks, and centralized telemetry can be qualified separately when required by a target host or deployment. [2026-07-28 release](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
