# ContextFlow CLI (MVP)

ContextFlow CLI provides a minimal viable terminal chat environment: simply run `contextflow` at the command line to enter an interactive Shell, configure/view Claude API Key, select model, have ongoing conversations with Sonnet 4.5, and write each conversation turn to a JSONL file under `.contextflow/`.

## Prerequisites
- Node.js 18 or higher (recommended with fnm / nvm)
- `ANTHROPIC_API_KEY` with Claude Sonnet 4.5 access

## Installation and Build
1. Install dependencies:
   ```bash
   npm install
   ```
2. Build TypeScript:
   ```bash
   npm run build
   ```
3. (Optional) Link CLI to global PATH:
   ```bash
   npm link
   ```
   After completion, you can run `contextflow` from any directory.

## Start Interactive Shell
```bash
contextflow
```

On startup, it automatically detects/creates `.contextflow` directory and displays the current conversation log path. The shell defaults to "chat mode" where you can directly input content to converse with the model; you can also adjust behavior through slash commands.

> Tip: If you've set `HTTP_PROXY`/`HTTPS_PROXY` in your environment, CLI will automatically enable proxy (no additional configuration needed).

When starting `contextflow`, you'll first be asked for your current VPN/proxy address (e.g. `127.0.0.1:10808`):
- Simply enter the address to automatically enable and save the proxy for default use next time
- Press Enter to use the previous value
- Enter `none` to disable proxy
The CLI will set environment variables internally and attach the proxy, no need to `export HTTPS_PROXY=...` in the terminal beforehand.

### Chat Mode Commands
- `/help`: View command list
- `/new NAME`: Create new conversation project
- `/config`: Enter configuration mode (set API Key, model, streaming output)
- `/project [NAME]`: List available projects when no parameter, switch conversation project when name provided
- `/clear`: Clear current session context memory
- `/exit`: Exit CLI

### Configuration Mode Commands
After entering configuration mode, the prompt changes to `config> `, supporting:
- `/help`: View configuration command descriptions
- `/api [KEY]`: View or update `ANTHROPIC_API_KEY`
- `/model [NAME]`: View or update default model (default `sonnet4.5`)
- `/proxy`: View current proxy and default proxy configuration
- `/param`: View model/API Key/proxy and other parameter status
- `/file`: View workspace and conversation log paths
- `/stream on|off`: Toggle streaming output
- `/back`: Return to chat mode

All configurations are written to `~/.config/contextflow/config.json` and take effect immediately at runtime.

## Conversation Logs and Memory
- Each time CLI starts, it defaults to using the `default` project and writes conversation turns to `.contextflow/conversations/<project>/conversation.jsonl`
- JSON Lines strictly conform to `schema/v1.0.json` (can reference `examples/*.contextflow`): `id` uses `turn-<uuid>`, `role` is `user|assistant|system`, includes `text`, ISO 8601 `timestamp` fields, convenient for later analysis or synchronization
- When restarting CLI, it automatically reads historical JSONL to restore the most recent 20 conversation turns for Claude; earlier turns are compressed into a single `system` summary message (truncated again if exceeding 1500 characters), preserving context memory while avoiding context window overflow

## Project Structure Overview
- `package.json`, `package-lock.json`: Define CLI metadata, execution entry `dist/bin/contextflow.js`, dependencies and scripts
- `bin/contextflow.ts`: CLI executable entry (shebang + main function)
- `src/runtime/contextflowShell.ts`: Interactive shell main loop, handles chat/configuration dual modes
- `src/runtime/logger.ts`: Encapsulates log output with `[contextflow]` prefix
- `src/core/`:
  - `config.ts`: Read/write `~/.config/contextflow/config.json`, parse runtime configuration
  - `conversationStore.ts`: Manage `.contextflow/conversations/<project>/conversation.jsonl`
  - `root.ts`: Find/create `.contextflow` project root directory
  - `types.ts`: Shared type definitions
- `src/providers/claude.ts`: Encapsulate Claude Messages API, support streaming and non-streaming
- `src/utils/fs.ts`: File system helper functions
- `dist/`: Compiled output generated after `npm run build`

## Development Notes
- TypeScript source located in `bin/` and `src/`
- Use `npm run build` to generate JS under `dist/`
- For debugging, run `npm start` or directly execute `node dist/bin/contextflow.js`
