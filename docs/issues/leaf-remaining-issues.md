# Leaf Feature - Remaining Issues

> Auto-generated from plan comparison on 2025-01-27
> Reference: `docs/plans/leaf-implementation-plan.md`

---

## Overview

Leaf implementation is ~85% complete. The following issues track the remaining work to reach full completion.

| Priority | Issue Count | Effort Estimate |
|----------|-------------|-----------------|
| High | 2 | Medium |
| Medium | 2 | Medium |
| Low | 4 | Large |

---

## High Priority Issues

### Issue #1: Connect WebUI Generate Button to API

**Labels**: `enhancement`, `webui`, `leaf`, `priority:high`

**Description**:
The Leaf detail page (`apps/web/src/app/project/[projectId]/leaf/[leafId]/page.tsx`) has a Generate button that is currently disabled with "Coming soon" text. Need to connect it to the existing `POST /v1/leaves/{id}/generate` API endpoint.

**Current State**:
- API endpoint exists and works: `POST /v1/leaves/{id}/generate`
- WebUI page exists with disabled button
- API client function may need to be added

**Acceptance Criteria**:
- [ ] Add `generateLeafOutput()` function to `apps/web/src/lib/api.ts`
- [ ] Enable Generate button on leaf detail page
- [ ] Show loading state during generation
- [ ] Display generated output after success
- [ ] Handle errors (API key missing, rate limit, generation failure)
- [ ] Show token usage / model info after generation

**Files to Modify**:
- `apps/web/src/lib/api.ts`
- `apps/web/src/app/project/[projectId]/leaf/[leafId]/page.tsx`

**Depends On**: None

---

### Issue #2: Connect WebUI Validate Button to API

**Labels**: `enhancement`, `webui`, `leaf`, `priority:high`

**Description**:
The Leaf detail page has a Validate button that is currently disabled. Need to connect it to the existing `POST /v1/leaves/{id}/validate` API endpoint.

**Current State**:
- API endpoint exists: `POST /v1/leaves/{id}/validate`
- Exact match validation works
- Semantic validation returns "not yet supported"
- WebUI button disabled

**Acceptance Criteria**:
- [ ] Add `validateLeafOutput()` function to `apps/web/src/lib/api.ts`
- [ ] Enable Validate button on leaf detail page
- [ ] Show loading state during validation
- [ ] Display assertion results (pass/fail badges)
- [ ] Show detailed evidence for failures
- [ ] Handle semantic validation gracefully (show warning that only exact match is supported)

**Files to Modify**:
- `apps/web/src/lib/api.ts`
- `apps/web/src/app/project/[projectId]/leaf/[leafId]/page.tsx`

**Depends On**: None

---

## Medium Priority Issues

### Issue #3: Implement Semantic Constraint Validation

**Labels**: `enhancement`, `core`, `leaf`, `priority:medium`

**Description**:
Currently semantic constraint validation (`match: 'semantic'`) is not fully supported in the API. The core logic exists in `packages/core/src/leaf/validate-constraints.ts` but requires an Embedder to be passed in. The API needs to integrate an embedder for semantic matching.

**Current State**:
- Core validation functions exist: `validateRequireSemantic()`, `validateExcludeSemantic()`
- Thresholds defined: REQUIRE >= 0.85, EXCLUDE < 0.70
- API returns error for semantic constraints

**Acceptance Criteria**:
- [ ] Choose embedder implementation (OpenAI, local, or existing T3X embedder)
- [ ] Initialize embedder in API context
- [ ] Pass embedder to validation functions when semantic constraints exist
- [ ] Add tests for semantic validation through API
- [ ] Update API documentation

**Files to Modify**:
- `apps/api/src/routes/leaves.openapi.ts` (validate endpoint)
- `apps/api/src/index.ts` (embedder initialization)
- `apps/api/src/__tests__/leaves-validate.test.ts`

**Depends On**: Embedder selection decision

---

### Issue #4: Add Leaf Type Filter to List Endpoints

**Labels**: `enhancement`, `api`, `leaf`, `priority:medium`

**Description**:
The list leaves endpoints (`GET /v1/commits/{hash}/leaves`, `GET /v1/projects/{projectId}/leaves`) have a `type` query parameter defined in the schema but filtering is not implemented in the storage layer.

**Current State**:
- API schema accepts `type` parameter
- Storage functions ignore the type filter

**Acceptance Criteria**:
- [ ] Add `type` parameter to `findLeavesByCommit()` in storage
- [ ] Add `type` parameter to `findLeavesByProject()` in storage
- [ ] Update API routes to pass type filter
- [ ] Add tests for type filtering

**Files to Modify**:
- `packages/storage/src/queries/leaves.ts`
- `apps/api/src/routes/leaves.openapi.ts`
- Tests

**Depends On**: None

---

## Low Priority Issues (Phase 4)

### Issue #5: Implement Template System

**Labels**: `enhancement`, `leaf`, `priority:low`, `phase4`

**Description**:
Create a template system for different leaf types to provide consistent output formatting.

**Acceptance Criteria**:
- [ ] Define template structure for each leaf type:
  - Tweet (280 chars, optional hashtags)
  - Article (sections, headings)
  - Email (subject, body, signature)
  - Weibo, WeChat, Slack variants
- [ ] Add template selection in leaf config
- [ ] Update prompt builder to use templates
- [ ] (Optional) Custom template editor UI

**Files to Create**:
- `packages/core/src/leaf/templates/`
- Update `build-prompt.ts`

**Depends On**: None

---

### Issue #6: Implement Leaf History/Versions

**Labels**: `enhancement`, `leaf`, `storage`, `priority:low`, `phase4`

**Description**:
Store generation history for each leaf to allow viewing and restoring previous outputs.

**Acceptance Criteria**:
- [ ] Create `leaf_history` table in storage schema
- [ ] Store each generation as a history entry (output, config, timestamp, model)
- [ ] Add API endpoint: `GET /v1/leaves/{id}/history`
- [ ] Add history view in WebUI leaf page
- [ ] Add "Restore" action to revert to previous output

**Files to Create**:
- `packages/storage/src/schema-v4.ts` (add table)
- `packages/storage/src/queries/leaf-history.ts`
- `apps/api/src/routes/leaf-history.openapi.ts`
- WebUI history component

**Depends On**: None

---

### Issue #7: Implement Batch Generation

**Labels**: `enhancement`, `leaf`, `api`, `priority:low`, `phase4`

**Description**:
Allow generating multiple leaf types from the same commit in one operation.

**Acceptance Criteria**:
- [ ] Add API endpoint: `POST /v1/commits/{hash}/leaves/batch`
- [ ] Accept array of leaf configs (types + settings)
- [ ] Generate all outputs (possibly in parallel)
- [ ] Return array of created leaves with results
- [ ] Add batch generation UI in WebUI

**Files to Modify**:
- `apps/api/src/routes/leaves.openapi.ts`
- WebUI (new batch generation component)

**Depends On**: Issue #1 (single generation working)

---

### Issue #8: Implement Export Functionality

**Labels**: `enhancement`, `leaf`, `webui`, `priority:low`, `phase4`

**Description**:
Allow exporting generated leaf outputs in various formats.

**Acceptance Criteria**:
- [ ] Copy to clipboard (already partially exists)
- [ ] Export as Markdown
- [ ] Export as JSON (with metadata: commit source, constraints, assertions)
- [ ] Export multiple leaves as ZIP
- [ ] (Future) Direct publish integration

**Files to Modify**:
- `apps/web/src/app/project/[projectId]/leaf/[leafId]/page.tsx`
- New export utility functions

**Depends On**: None

---

## Issue Dependency Graph

```
Issue #1 (Generate Button) ─────────────────────────────────────┐
                                                                 │
Issue #2 (Validate Button) ──────────────────────────────────┐  │
                                                              │  │
Issue #3 (Semantic Validation) ───────────────────────────┐  │  │
                                                           │  │  │
Issue #4 (Type Filter) ────────────────────────────────┐  │  │  │
                                                        │  │  │  │
                                                        ▼  ▼  ▼  ▼
                                                    [Core Complete]
                                                           │
                          ┌────────────────────────────────┼────────────────────────────────┐
                          │                                │                                │
                          ▼                                ▼                                ▼
                    Issue #5                         Issue #6                         Issue #7
                   (Templates)                   (Leaf History)                  (Batch Generation)
                                                                                        │
                                                                                        ▼
                                                                                   Issue #8
                                                                                    (Export)
```

---

## Suggested Implementation Order

1. **Sprint 1 (High Priority)**:
   - Issue #1: Generate Button
   - Issue #2: Validate Button

2. **Sprint 2 (Medium Priority)**:
   - Issue #3: Semantic Validation
   - Issue #4: Type Filter

3. **Sprint 3+ (Phase 4)**:
   - Issue #5-8 based on user demand

---

## Notes

- Issues #1 and #2 are independent and can be done in parallel
- Issue #3 requires a decision on which embedder to use
- Phase 4 issues are nice-to-have and can be deprioritized

---

*Generated: 2025-01-27*
