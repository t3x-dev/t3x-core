# T3X Naming Conventions Guide

This guide establishes consistent naming patterns across the T3X codebase to make code self-documenting and easier to navigate.

---

## 1. Layered Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│  Layer              │  Location                │  Suffix       │
├────────────────────────────────────────────────────────────────┤
│  API Routes         │  app/api/v1/*            │  route.ts     │
│  Services           │  lib/services/*          │  .service.ts  │
│  Repositories       │  @t3x/storage/queries/*  │  .ts          │
│  Engines            │  @t3x/core/engines/*     │  .engine.ts   │
│  Providers          │  lib/providers/*         │  .provider.ts │
│  Types              │  types/*                 │  .types.ts    │
└────────────────────────────────────────────────────────────────┘
```

---

## 2. API Route Naming

### URL Structure

```
/api/v1/{resource}                    # Collection
/api/v1/{resource}/{id}               # Single item
/api/v1/{resource}/{id}/{sub-resource}  # Nested resource
/api/v1/{resource}/{action}           # Custom action
```

### Rules

| Rule | Good | Bad |
|------|------|-----|
| Use plural nouns for resources | `/projects`, `/turns` | `/project`, `/turn` |
| Use kebab-case for multi-word | `/two-way`, `/merge-results` | `/twoWay`, `/merge_results` |
| Use path params for IDs | `/projects/{id}` | `/projects?id=123` |
| Group related actions | `/branches/switch` | `/switch-branch` |
| Version the API | `/api/v1/...` | `/api/...` |

### Standard Routes per Resource

```
GET    /api/v1/{resource}           # List all
POST   /api/v1/{resource}           # Create new
GET    /api/v1/{resource}/{id}      # Get one
PUT    /api/v1/{resource}/{id}      # Replace
PATCH  /api/v1/{resource}/{id}      # Partial update
DELETE /api/v1/{resource}/{id}      # Delete
```

### T3X Routes Reference

| Resource | Routes |
|----------|--------|
| Projects | `GET/POST /projects`, `GET/PUT/DELETE /projects/{id}` |
| Conversations | `GET/POST /conversations`, `GET/PUT/DELETE /conversations/{id}` |
| Turns | `GET/POST /turns`, `GET /turns/{hash}`, `GET /turns/{hash}/chain` |
| Commits | `GET/POST /commits`, `GET /commits/{hash}` |
| Branches | `GET/POST /branches`, `GET /branches/current`, `POST /branches/switch` |
| Drafts | `GET/POST /drafts`, `GET/PATCH/DELETE /drafts/{id}` |
| Agent Drafts | `POST /agent/drafts`, `GET/PATCH /agent/drafts/{id}` |
| Diff | `POST /diff/two-way`, `POST /diff/three-way` |
| Merge | `POST /merge`, `POST /merge/resolve` |
| Export | `GET /export/cfpack`, `GET /export/ledger` |
| Chat | `POST /chat`, `POST /chat/stream`, `GET /chat/providers` |

---

## 3. Function Naming

### By Responsibility (Prefix)

| Prefix | Responsibility | When to Use |
|--------|---------------|-------------|
| `create*` | Create new entity | Factory functions, object instantiation |
| `insert*` | Persist to database | Database write operations |
| `find*` | Query single/multiple | Database read operations |
| `update*` | Modify existing | Database update operations |
| `delete*` | Remove | Database delete operations |
| `compute*` | Pure calculation | Hash, diff, similarity |
| `validate*` | Check validity | Input validation, business rules |
| `build*` | Construct complex object | Prompts, responses, queries |
| `parse*` | Extract from raw data | JSON parsing, text extraction |
| `transform*` | Convert format | DTO mapping, format conversion |
| `extract*` | Pull out subset | Ring extraction, keyword extraction |
| `generate*` | Create new value | IDs, hashes, tokens |
| `load*` | Fetch from external | Cache loading, file reading |
| `save*` | Persist to external | Cache saving, file writing |

### By Layer

#### Repository Layer (@t3x/storage)

Pattern: `{action}{Entity}` or `{action}{Entity}By{Field}`

```typescript
// Create
insertProject(db, input)
insertTurn(db, input)
insertDraft(db, input)

// Read - single
findProjectById(db, projectId)
findTurnByHash(db, turnHash)
findCommitByHash(db, commitHash)
findBranchByName(db, projectId, name)

// Read - multiple
findProjects(db, options)
findTurnsByConversation(db, options)
findTurnsByProject(db, options)
findCommitsByProject(db, options)
findDraftsByProject(db, options)

// Update
updateProject(db, projectId, input)
updateDraft(db, draftId, input)
updateDraftStatus(db, draftId, status)
updateBranchHead(db, branchId, headHash)

// Delete
deleteProject(db, projectId)
deleteDraft(db, draftId)
deleteBranch(db, branchId)

// Specialized
adoptDraft(db, draftId)           # Status change
supersedeDraft(db, draftId)       # Status change
switchBranch(db, projectId, name) # Complex operation
ensureMainBranch(db, projectId)   # Upsert pattern
```

#### Engine Layer (@t3x/core)

Pattern: `create{Name}Engine` for factories, methods on engine instance

```typescript
// Factory
const diffEngine = createDiffEngine(options)
const mergeEngine = createMergeEngine(options)
const extractor = createRingExtractor(options)

// Engine methods
diffEngine.computeTwoWay(base, target)
diffEngine.computeThreeWay(base, ours, theirs)
mergeEngine.merge(base, ours, theirs)
mergeEngine.resolveConflicts(result, resolutions)
extractor.extract(text)
```

#### Provider Layer (lib/providers)

Pattern: `create{Name}Provider` for factories, implements interface methods

```typescript
// Factory
const llmProvider = createClaudeProvider(config)
const embeddingProvider = createGoogleAIEmbeddingProvider(config)
const cachedProvider = createCachedEmbeddingProvider(inner, db)

// Interface methods (LLMProvider)
provider.generate(prompt, options)
provider.generateStream(prompt, options)

// Interface methods (EmbeddingProvider)
provider.embed(text)
provider.embedBatch(texts)
```

#### Utility Functions

Pattern: `{action}{Object}` - short, descriptive

```typescript
// Hashing
computeTurnHash(input)
computeTextHash(text)
sha256(payload)

// Text processing
canonText(text)
hashText(input)
cosineSimilarity(vecA, vecB)

// Validation
validateDraft(text, mustHave, mustntHave)
hasWholeWord(text, keyword)

// Generation
generateProjectId()
generateDraftId()
generateSegmentId()
```

---

## 4. Type & Interface Naming

### Patterns

| Type | Pattern | Example |
|------|---------|---------|
| Entity | `{Name}` | `Project`, `Turn`, `Draft` |
| Input DTO | `Create{Name}Input` | `CreateProjectInput`, `CreateTurnInput` |
| Update DTO | `Update{Name}Input` | `UpdateProjectInput`, `UpdateDraftInput` |
| List Options | `List{Name}Options` | `ListProjectsOptions`, `ListTurnsOptions` |
| API Response | `{Name}Response` | `ProjectResponse`, `DraftResponse` |
| Config | `{Name}Config` | `LLMConfig`, `ClaudeProviderConfig` |
| Result | `{Name}Result` | `MergeResult`, `DiffResult` |
| Error | `{Name}Error` | `LLMProviderError`, `CommitError` |

### Examples

```typescript
// Entity
interface Project {
  projectId: string;
  name: string;
  createdAt: Date;
}

// Input DTO
interface CreateProjectInput {
  name: string;
  description?: string;
}

// List Options
interface ListProjectsOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'name' | 'createdAt';
}

// API Response
interface ProjectResponse {
  project_id: string;      // snake_case for API
  name: string;
  created_at: string;      // ISO string for API
}
```

---

## 5. File & Module Naming

### Patterns

| Type | Pattern | Example |
|------|---------|---------|
| Route handler | `route.ts` | `app/api/v1/projects/route.ts` |
| Service | `{name}.service.ts` | `diff.service.ts` |
| Repository | `{name}.ts` | `projects.ts`, `turns.ts` |
| Engine | `{name}.engine.ts` | `diff.engine.ts` |
| Provider | `{name}.provider.ts` | `claude.provider.ts` |
| Types | `{name}.types.ts` | `nodes.types.ts` |
| Constants | `{name}.constants.ts` | `api.constants.ts` |
| Utilities | `{name}.utils.ts` | `hash.utils.ts` |
| Hooks (React) | `use{Name}.ts` | `useApi.ts`, `useProject.ts` |
| Store (Zustand) | `{name}Store.ts` | `projectStore.ts` |
| Component | `{Name}.tsx` | `Sidebar.tsx`, `NodeModal.tsx` |

### Directory Structure

```
src/
├── app/
│   └── api/
│       └── v1/
│           ├── projects/
│           │   ├── route.ts           # GET, POST /projects
│           │   └── [id]/
│           │       └── route.ts       # GET, PUT, DELETE /projects/{id}
│           ├── turns/
│           ├── commits/
│           └── ...
├── lib/
│   ├── db.ts                          # Database connection
│   ├── providers/
│   │   ├── index.ts                   # Exports
│   │   ├── claude.ts                  # Claude LLM provider
│   │   └── embedding.ts               # Embedding providers
│   └── services/                      # Business logic (if needed)
├── components/
│   ├── ui/                            # Reusable UI components
│   └── ...                            # Feature components
├── hooks/
│   ├── useApi.ts
│   └── useProject.ts
├── store/
│   ├── projectStore.ts
│   └── canvasStore.ts
└── types/
    └── nodes.ts
```

---

## 6. Error Code Naming

### Pattern: `SCREAMING_SNAKE_CASE`

```typescript
// Categories
const errorCodes = {
  // Validation errors
  INVALID_REQUEST: 'Invalid request parameters',
  INVALID_JSON: 'Invalid JSON body',
  MISSING_FIELD: 'Required field missing',

  // Not found errors
  NOT_FOUND: 'Resource not found',
  PROJECT_NOT_FOUND: 'Project not found',
  CONVERSATION_NOT_FOUND: 'Conversation not found',

  // Conflict errors
  ALREADY_EXISTS: 'Resource already exists',
  CONFLICT: 'Operation conflicts with current state',

  // External service errors
  LLM_ERROR: 'LLM provider error',
  PROVIDER_ERROR: 'External provider error',
  EMBEDDING_ERROR: 'Embedding generation failed',

  // Operation errors
  DRAFT_CREATE_FAILED: 'Failed to create draft',
  MERGE_FAILED: 'Merge operation failed',
  COMMIT_FAILED: 'Commit operation failed',
};
```

---

## 7. API Response Field Naming

### Rule: snake_case for API, camelCase internally

```typescript
// Internal TypeScript (camelCase)
interface Project {
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
}

// API Response (snake_case)
interface ProjectResponse {
  project_id: string;
  created_at: string;
  updated_at: string;
}

// Transformation
function toResponse(project: Project): ProjectResponse {
  return {
    project_id: project.projectId,
    created_at: project.createdAt.toISOString(),
    updated_at: project.updatedAt.toISOString(),
  };
}
```

---

## 8. Quick Reference

### Do's

- Use descriptive names that explain what the function does
- Use consistent prefixes for similar operations
- Group related functions in the same module
- Use TypeScript interfaces for all inputs/outputs
- Document complex functions with JSDoc

### Don'ts

- Don't mix naming patterns (e.g., `createUser` and `insertProject`)
- Don't use abbreviations unless universally understood
- Don't use generic names like `data`, `info`, `handle`
- Don't duplicate entity name in method (e.g., `project.getProject()`)

### Consistency Checklist

- [ ] All CRUD operations use same prefix pattern
- [ ] All factory functions use `create*` prefix
- [ ] All query functions use `find*` prefix
- [ ] All API responses use snake_case
- [ ] All TypeScript uses camelCase
- [ ] All error codes use SCREAMING_SNAKE_CASE
- [ ] All files follow naming pattern for their type

---

## 9. Migration Notes

When renaming for consistency:

1. Update the function/type definition
2. Update all imports and usages
3. Update any API contracts (may need versioning)
4. Update tests
5. Update documentation

For breaking API changes, consider:
- Supporting both old and new names temporarily
- Versioning the API (`/api/v2/...`)
- Documenting the migration path
