# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ContextFlow is a **semantic version control system** for AI conversations - "Git for Meaning". It provides evidence-backed, deterministic semantic tracking with full provenance for every claim. The repository is a monorepo combining three previously separate projects:

- **contextflow-core**: Deterministic Python engine with NLP-based semantic extraction
- **contextflow-cli**: Node.js/TypeScript interactive CLI for conversational logging
- **contextflow-webui**: React/Vite dashboard for visualizing semantic lineage

## Architecture

### Four-Layer Design

1. **Layer 1 - Storage**: JSONL (turns) + SQLite (findings/aspects/evidence) with `.cfpack` export
2. **Layer 2 - Lineage Protocol**: Two-chain system (turn chain + commit chain) with SHA-256 hashing and Ed25519 signatures
3. **Layer 3 - Semantic Core**: Deterministic finding extraction, evidence scoring, aspect synthesis, conflict detection
4. **Layer 4 - Product**: CLI commands, WebUI visualization, API endpoints

### Data Flow

```
User Input → Turn → Extractors (Ring 1/2/3) → Findings → Aspect Synthesis → Draft → Commit
                                                    ↓
                                            Evidence Cache (SQLite)
```

### Key Concepts

- **Turn**: A single conversational exchange (user/assistant message) with timestamp, role, text
- **Finding**: Extracted semantic units (entity, phrase, relation) with evidence pointer to source turn
- **Aspect**: Merged/synthesized semantic state with confidence scores and evidence lineage
- **Draft**: Uncommitted semantic state being built from findings
- **Commit**: Immutable snapshot of semantic state with cryptographic hash and signature

## Build & Development Commands

### contextflow-core (Python)

```bash
cd contextflow-core

# Setup Python environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements-dev.txt

# Download spaCy models (required for NLP extractors)
python -m spacy download en_core_web_sm
python -m spacy download zh_core_web_sm  # For Chinese support

# Run tests
pytest tests -v
pytest --cov=core --cov-report=term-missing  # With coverage

# Run single test
pytest tests/test_specific.py::test_function_name -v

# Code quality checks
black core/ core_api/ tests/
isort core/ core_api/ tests/
flake8 core/ core_api/
mypy core/ core_api/

# Start FastAPI server
cd core_api
python -m core_api  # or: uvicorn core_api.app:app --reload
```

Alternative test script (wraps above with dependency checks):
```bash
./test.sh
```

### contextflow-cli (TypeScript)

```bash
cd contextflow-cli

# Install and build
npm install
npm run build

# Start CLI (local)
npm start

# Link globally (optional)
npm link
contextflow  # Now available globally

# Development workflow
# Edit TypeScript in bin/ or src/
npm run build  # Recompile
node dist/bin/contextflow.js  # Test
```

### contextflow-webui (React/Vite)

```bash
cd contextflow-webui

# Install dependencies
npm install

# Development server (hot reload)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview

# Linting
npm run lint
```

## Critical Data Schemas

All JSON/JSONL artifacts follow strict schemas in `contextflow-core/schema/`:

- `v1.0.json`: Turn format (id, role, text, timestamp, metadata)
- `commit.v1.json`: Commit structure with parent hash, aspects, evidence
- `facet.v1.json`: Finding/aspect metadata
- `intent_graph_v1.0.json`: Intent classification structure
- `narrative_patch_v1.0.json`: Diff/merge patch format

**Critical**: Never rename fields or restructure these formats ad-hoc. Changes require schema version bumps and migration scripts.

## Core Module Organization

### contextflow-core/

```
core/                    # Core deterministic engine
├── agents/              # Optional LLM agents (SummaryAgent, MergeAgent)
├── bridges/             # Template-based fallbacks
├── diff/                # Semantic diffing logic
├── draft/               # Draft state management
├── embedding/           # Similarity calculations (sentence-transformers)
├── extractors/          # Ring 1/2/3 NLP extractors (spaCy, jieba)
├── ledger/              # Turn chain, commit chain, evidence ledger
├── llm/                 # LLM provider integrations (OpenAI, Claude)
└── storage/             # JSONL writer, SQLite persistence

core_api/                # FastAPI HTTP reference implementation
├── routes/              # API endpoints (projects, conversations, turns, commits, branches, diff, merge, export, agent)
├── app.py               # Main FastAPI app with CORS and lifespan
├── database.py          # SQLite schema initialization
├── dependencies.py      # Dependency injection helpers
├── errors.py            # Exception handlers
└── schemas.py           # Pydantic models for request/response

schema/                  # JSON schema definitions
examples/                # Sample .contextflow files for testing
tests/                   # 311 pytest test suites (100% passing)
docs/                    # Architecture docs (PHASE2_EXECUTION_PLAN.md, etc.)
sdk/                     # Language SDKs (JavaScript in sdk/javascript/)
```

### contextflow-cli/

```
bin/
└── contextflow.ts       # Entry point (shebang + main())

src/
├── core/                # Core logic
│   ├── config.ts        # ~/.contextflow/config.json management
│   ├── conversationStore.ts  # JSONL turn persistence
│   ├── coreClient.ts    # HTTP client for core_api endpoints
│   ├── db.ts            # SQLite local cache (drafts, insights)
│   ├── projectCache.ts  # Project metadata caching
│   ├── root.ts          # .contextflow/ directory discovery
│   ├── schema.sql       # CLI local SQLite schema
│   ├── types.ts         # TypeScript type definitions
│   └── validate.ts      # Schema validation helpers
├── runtime/
│   ├── contextflowShell.ts  # Interactive shell main loop
│   └── logger.ts        # Logging with [contextflow] prefix
├── providers/
│   └── claude.ts        # Claude Messages API wrapper (streaming)
├── utils/
│   └── fs.ts            # File system helpers
└── server.ts            # Local HTTP API server for WebUI integration
```

### contextflow-webui/

```
src/
├── pages/               # Route components
│   ├── CanvasWorkspace.tsx     # Main interactive canvas
│   ├── SemanticLedgerPage.tsx  # Ledger/timeline view
│   └── WorkflowDetailPage.tsx  # Workflow detail modal
├── components/          # Reusable UI components
│   ├── CanvasNodes.tsx  # ReactFlow node definitions
│   ├── NodeModal.tsx    # Node detail modal
│   ├── SemanticCard.tsx # Semantic aspect card
│   └── TopNav.tsx       # Navigation bar
├── store/               # Zustand state management
│   ├── canvasStore.ts   # Canvas/graph state
│   └── workflowStore.ts # Workflow data state
├── types/               # TypeScript interfaces
├── data/                # Mock/fixture data
└── App.tsx              # Root component with React Router
```

## CLI Interactive Shell Commands

### Chat Mode (default)

- `/help` - Show available commands
- `/new NAME` - Create new conversation project
- `/project [NAME]` - List or switch conversation projects
- `/config` - Enter configuration mode
- `/clear` - Clear current conversation context
- `/exit` - Exit CLI

### Config Mode

- `/api [KEY]` - View/set `ANTHROPIC_API_KEY`
- `/model [NAME]` - View/set model (default: `sonnet4.5`)
- `/proxy` - View proxy configuration
- `/param` - View all parameters (API key, model, proxy)
- `/file` - View workspace and log paths
- `/stream on|off` - Toggle streaming output
- `/back` - Return to chat mode

Config persists in `~/.contextflow/config.json`.

## Important Configuration Files

### contextflow-core/.env
```
# Load order: contextflow-core/.env → ~/.contextflow/.env → cwd/.env
ANTHROPIC_API_KEY=sk-...
OPENAI_API_KEY=sk-...
```

### contextflow-webui/.env.local
```
VITE_API_BASE_URL=http://localhost:8000
```

### ~/.contextflow/config.json (CLI)
```json
{
  "apiKey": "sk-...",
  "model": "sonnet4.5",
  "stream": true,
  "proxy": {
    "host": "127.0.0.1",
    "port": 10808
  }
}
```

## Coding Conventions

### Python (contextflow-core)

- **Formatter**: Black (88 columns, double quotes)
- **Import sorting**: isort
- **Linting**: flake8
- **Type checking**: mypy (required for all exported functions)
- **Naming**: `snake_case` for modules/functions, `PascalCase` for classes
- **Testing**: pytest with fixtures in `tests/`

### TypeScript (contextflow-cli, contextflow-webui)

- **Indentation**: 2 spaces
- **Naming**: `camelCase` for utilities/functions, `PascalCase` for React components
- **CLI structure**: Keep command files thin, push logic to `src/core/`
- **WebUI state**: Zustand stores in `src/store/`
- **Testing**: Manual smoke tests for CLI, Vitest for WebUI (not yet implemented)

## Local Development Workflow

### Starting Full Stack

1. **Start Core API** (Terminal 1):
   ```bash
   cd contextflow-core
   source .venv/bin/activate
   cd core_api
   python -m core_api  # Runs on http://localhost:8000
   ```

2. **Start CLI** (Terminal 2):
   ```bash
   cd contextflow-cli
   npm run build && npm start
   ```

3. **Start WebUI** (Terminal 3):
   ```bash
   cd contextflow-webui
   npm run dev  # Runs on http://localhost:5173
   ```

### Testing Changes

- **Core changes**: Run `pytest tests/<module>/ -v` for affected modules
- **CLI changes**: Rebuild with `npm run build`, test commands: `contextflow`, `/config`, log persistence
- **WebUI changes**: Manual verification in browser or add Vitest tests

## Common Pitfalls

### Python Virtual Environment

Always activate venv before running Python commands:
```bash
source .venv/bin/activate  # Bash/Zsh
.venv\Scripts\activate     # Windows
```

### spaCy Models

If you see "Model 'en_core_web_sm' not found":
```bash
python -m spacy download en_core_web_sm
python -m spacy download zh_core_web_sm
```

### TypeScript Build

CLI changes require rebuild:
```bash
cd contextflow-cli
npm run build  # Don't forget this!
```

### Schema Validation

Turns must follow exact schema in `contextflow-core/schema/v1.0.json`:
- `id`: Format `turn-<uuid>`
- `role`: One of `user`, `assistant`, `system`
- `text`: Required string
- `timestamp`: ISO 8601 format

### JSONL Canonicalization

All JSONL lines must use JCS (JSON Canonicalization Scheme) for deterministic hashing. Use `json-canonicalize` library in TypeScript or `canonicaljson` in Python.

## Integration Points

### CLI ↔ Core API

CLI can talk to local Core API via `coreClient.ts`:
```typescript
import { CoreClient } from './core/coreClient';

const client = new CoreClient('http://localhost:8000');
await client.createTurn(projectId, conversationId, turnData);
```

### WebUI ↔ CLI Server

WebUI can connect to CLI's local API server (started via `server.ts`):
```typescript
// CLI server runs on http://localhost:8765
// Endpoints: GET /api/status, POST /api/turns, POST /api/commit
// Requires X-CF-Token header
```

### WebUI ↔ Core API

WebUI primarily fetches from Core API for semantic data:
```typescript
// GET /api/v1/projects
// GET /api/v1/conversations/:id/turns
// POST /api/v1/commits
```

## Security

- **Never commit tokens**: API keys go in `.env` or `~/.contextflow/config.json`
- **Purge personal data**: Remove sensitive info from `.contextflow/` artifacts before sharing logs
- **Token authentication**: CLI API server requires `X-CF-Token` header by default

## Phase Status (as of 2025-11-10)

- **Phase 0-4**: Complete
- **Phase 2.5**: SQLite persistence, evidence caching, embedding cache complete
- **Week 2 Lock system**: Complete
- **Tests**: 311/311 passing (100%)

See `contextflow-core/docs/PHASE2_EXECUTION_PLAN.md` for detailed status.

## Useful References

- Architecture: `contextflow-core/README.md`
- API Spec: `contextflow-core/docs/CORE_API_SPEC.zh.md` (if exists)
- Phase Plan: `contextflow-core/docs/PHASE2_EXECUTION_PLAN.md`
- Schemas: `contextflow-core/schema/*.json`
- Examples: `contextflow-core/examples/*.contextflow`
