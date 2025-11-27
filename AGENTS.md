# Repository Guidelines

## Project Structure & Module Organization
- `contextflow-core/` is the deterministic Python engine (`core/`, `core_api/`, schemas in `schema/`, SDKs in `sdk/`, tests in `tests/`, runnable examples in `examples/`).
- `contextflow-cli/` hosts the Node.js CLI; `bin/contextflow.ts` is the entry point, shared utilities live in `src/`, and compiled code lands in `dist/`.
- `contextflow-webui/` is the Vite + React dashboard (`src/pages`, `src/components`, Zustand stores under `src/state`, and public assets in `public/`).

## Build, Test, and Development Commands
- Core pipeline:
```bash
cd contextflow-core
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
pytest tests -v
```
`./test.sh` wraps the same sequence with dependency checks.
- CLI:
```bash
cd contextflow-cli
npm install
npm run build
npm start
```
- WebUI:
```bash
cd contextflow-webui
npm install
npm run dev
npm run build
npm run lint
```

## Coding Style & Naming Conventions
- Python modules follow Black (88 columns, double quotes) plus `isort`, and every exported surface needs typing; gate changes with `flake8` and `mypy`.
- TypeScript services stick to 2-space indents, `camelCase` utilities, `PascalCase` components, and shared state modules under `src/state`. Keep CLI command files thin and push logic into `src/core/`.
- JSON/JSONL artifacts must remain canonicalized per `contextflow-core/schema/`; avoid ad-hoc field renames.

## Testing Guidelines
- Coverage is anchored in `pytest`; run `pytest --cov=core --cov-report=term-missing` before sending patches and mirror fixtures found in `tests/` when adding schemas.
- WebUI work should include either Vitest suites or manual verification notes (route exercised, browser) in the PR until UI tests land.
- The CLI presently depends on manual smoke tests—run `contextflow`, `/config`, and log persistence flows whenever CLI code changes.

## Commit & Pull Request Guidelines
- Keep Conventional Commit verbs from history (`feat`, `chore`, `fix`); scope when touching a single surface (`feat(cli): add audit log`).
- PRs should describe intent, affected packages, linked issues, and screenshots/GIFs for UI work. Call out schema or migration impacts so SDK owners can review.

## Security & Configuration Tips
- Never commit tokens. The CLI loads `ANTHROPIC_API_KEY` plus proxy data from `~/.contextflow/config.json`; WebUI secrets belong in `.env.local`.
- Purge personal data from `.contextflow/` artifacts and SQLite snapshots before attaching logs or recordings to reviews.
