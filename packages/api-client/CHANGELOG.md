# @t3x-dev/api-client

## Unreleased

- Add `client.generation` for complete and streaming model invocation and provider discovery.
- Add `client.sourceThreads` for durable source metadata, immutable turns, context, and repository evidence.
- Keep the existing `chat`, conversation, and turn methods as deprecated compatibility aliases over the same `/v1/chat*`, `/v1/conversations*`, and `/v1/turns*` routes.
- Correct the typed Generation response and provider-catalog shapes to match the existing API wire contract.
- Require `project_id` when appending a turn, matching the existing server contract.
- Remove the unusable `listAgentDrafts` method, whose advertised endpoint never existed.

## 0.6.0

## 0.5.1

## 0.5.0

## 0.4.1

## 0.4.0

## 0.3.1

## 0.3.0

## 0.2.0

## 0.1.5

## 0.1.4

## 0.1.3

## 0.1.2

## 0.2.0

### Minor Changes

- Initial release
