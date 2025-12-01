import { randomUUID } from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import {
  openDB,
  createTurn,
  listTurns,
  openDraft,
  commitDraft,
  status,
  updateDraft,
  type TurnRecord,
  type DraftKind,
  type TurnRole,
} from '../core/db';
import { discoverProjectRoot } from '../core/root';
import { ConversationStore } from '../core/conversationStore';
import { ChatMessage, UserConfig, ConversationTurn } from '../core/types';
import {
  DEFAULT_MODEL,
  type StorageMode,
  loadAppPreferences,
  readUserConfig,
  resolveRuntimeConfig,
  shouldUseJsonlStorage,
  shouldUseSqliteStorage,
  writeUserConfig,
} from '../core/config';
import { validateAll } from '../core/validate';
// Note: Direct Claude API call removed. All LLM calls now go through Core API.
// import { createChatCompletion } from '../providers/claude';
import { getCoreClient, CoreApiError } from '../core/coreClient';
import { ensureDir, pathExists } from '../utils/fs';
import { startApiServer, getApiServerInfo } from '../server';
import {
  startEmbeddedServer,
  stopEmbeddedServer,
  getEmbeddedServerInfo,
  isEmbeddedServerRunning,
} from '../server/index';
import { configureLogger, logger } from './logger';
import {
  initProjectCache,
  getCurrentProjectName,
  setCurrentProjectName,
  createProjectViaApi,
  listProjectsViaApi,
  projectExistsViaApi,
  deleteProjectViaApi,
  syncCache,
  createTurnViaApi,
  listTurnsViaApi,
  ensureConversationForProject,
  getProjectIdByName,
  getCurrentConversationId,
  getCachedConversation,
  listBranchesViaApi,
  createBranchViaApi,
  switchBranchViaApi,
  getCurrentBranchViaApi,
  listCommitsViaApi,
  diffCommitsViaApi,
  getSystemStatusViaApi,
  createCommitViaApi,
  createDraftViaApi,
  getDraftViaApi,
  updateDraftViaApi,
} from '../core/projectCache';

type Mode = 'chat' | 'config';

interface SessionOverrides {
  apiKey?: string;
  model?: string;
}

interface SessionState {
  mode: Mode;
  project: string;
  messages: ChatMessage[];
  overrides: SessionOverrides;
  stream: boolean;
}

type ChatCommandResult =
  | { type: 'none' }
  | { type: 'enterConfig' }
  | { type: 'switchProject'; project: string }
  | { type: 'resetConversation' };

type ConfigCommandResult = 'stay' | 'back';

const CHAT_PROMPT = '> ';
const CONFIG_PROMPT = 'config> ';
const APP_VERSION = 'v1.0';
const BANNER_INNER_WIDTH = 43;
const MAX_MEMORY_TURNS = 20;
const HISTORY_SUMMARY_CHAR_LIMIT = 1500;

let proxyActivationPending = false;
let sqliteReady = false;
let storageMode: StorageMode = 'both';
let jsonlEnabled = true;
let sqliteEnabled = true;

export async function startContextflowShell(): Promise<void> {
  const preferences = await loadAppPreferences();
  configureLogger(preferences.trace);
  storageMode = preferences.storageMode;
  jsonlEnabled = shouldUseJsonlStorage(storageMode);
  sqliteEnabled = shouldUseSqliteStorage(storageMode);

  await ensureProxyConfigured();
  await normalizeProxyEnv();

  const root = await discoverProjectRoot(process.cwd());

  if (sqliteEnabled) {
    try {
      const dbPath = openDB(root.projectRoot);
      sqliteReady = true;
      logger.info(`🧾 ContextFlow DB ready: ${dbPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`SQLite initialization failed, related commands unavailable: ${message}`);
      sqliteReady = false;
    }
  } else {
    logger.info('storageMode=JSONL, using JSONL storage only.');
  }

  // Start embedded TypeScript API server for Ring extraction, Diff, Merge
  try {
    const embeddedInfo = await startEmbeddedServer({ port: 8100 });
    logger.info(`🚀 Embedded API server: http://${embeddedInfo.host}:${embeddedInfo.port}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Embedded server failed to start: ${message}`);
    logger.warn('Ring extraction, Diff, and Merge features may be unavailable.');
  }

  // Initialize project cache for core_api integration
  initProjectCache(root.contextflowDir);
  try {
    await syncCache();
    logger.trace('cache', 'Project cache synced with core_api');
  } catch (error) {
    logger.trace('cache', `Cache sync skipped: ${(error as Error).message}`);
  }

  let store = jsonlEnabled ? new ConversationStore(root.contextflowDir, 'default') : null;

  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
    terminal: true,
  });

  const state: SessionState = {
    mode: 'chat',
    project: 'default',
    messages: [],
    overrides: {},
    stream: true,
  };

  await hydrateSessionMessages(store, state);

  let prompt = CHAT_PROMPT;
  rl.setPrompt(prompt);

  await logInitialGuidance(state);

  const close = async () => {
    rl.close();
    // Stop embedded server on exit
    await stopEmbeddedServer();
  };

  rl.on('SIGINT', async () => {
    stdout.write('\n');
    await close();
  });

  try {
    while (true) {
      let input: string;
      try {
        input = await rl.question(prompt);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ERR_USE_AFTER_CLOSE') {
          break;
        }
        throw error;
      }

      const trimmed = input.trim();
      if (!trimmed) {
        continue;
      }

      const normalized = trimmed.toLowerCase();
      if (normalized === '/exit' || normalized === '/quit') {
        await close();
        break;
      }

      if (state.mode === 'config') {
        const result = await handleConfigMode(trimmed, state, store, root.contextflowDir);
        if (result === 'back') {
          state.mode = 'chat';
          prompt = CHAT_PROMPT;
          rl.setPrompt(prompt);
        }
        continue;
      }

      if (trimmed.startsWith('/')) {
        const slashHandled = await handleSlashCommand(trimmed, state, root.contextflowDir, rl);
        if (slashHandled) {
          continue;
        }
        const commandResult = await handleChatCommand(
          trimmed,
          state,
          store,
          root.contextflowDir,
        );

        if (commandResult.type === 'enterConfig') {
          state.mode = 'config';
          prompt = CONFIG_PROMPT;
          rl.setPrompt(prompt);
          printConfigHelp();
          continue;
        }

        if (commandResult.type === 'switchProject') {
          state.project = commandResult.project;
          store = jsonlEnabled ? new ConversationStore(root.contextflowDir, state.project) : null;
          state.messages = [];
          await hydrateSessionMessages(store, state);
          logger.info(`Switched to project "${state.project}".`);
          if (store) {
            logger.info(`Conversation log: ${store.filePath}`);
          }
          continue;
        }

        if (commandResult.type === 'resetConversation') {
          state.messages = [];
          logger.info('Current conversation context cleared.');
          continue;
        }

        continue;
      }

      await handleChatMessage(input, state, store);
    }
  } finally {
    rl.close();
  }
}

async function handleChatMessage(
  input: string,
  state: SessionState,
  store: ConversationStore | null,
): Promise<void> {
  const userTurn = await appendConversationTurn(store, {
    role: 'user',
    text: input,
  });
  persistTurnToDatabase(userTurn, state.project);
  // Also persist to core_api for semantic extraction
  persistTurnToCoreApi(userTurn, state.project).catch(() => {
    // Silently ignore core_api errors
  });

  state.messages.push({
    role: 'user',
    content: input,
  });

  try {
    const { model } = await resolveRuntimeConfig(state.overrides);

    let assistantText = '';

    // All LLM calls go through Core API (LLM is a plugin in Core)
    const coreAvailable = await checkCoreApiAvailable();

    if (!coreAvailable) {
      logger.error('Core API is not available. Please start Core API first:');
      logger.error('  cd contextflow-core && python -m core_api');
      return;
    }

    const client = getCoreClient();

    if (state.stream) {
      // Use Core API streaming
      assistantText = await client.chatStream(
        state.messages.map(m => ({ role: m.role, content: m.content })),
        (token) => {
          stdout.write(token);
        },
        {
          model,
        }
      );
    } else {
      // Use Core API non-streaming
      const response = await client.chat(
        state.messages.map(m => ({ role: m.role, content: m.content })),
        {
          model,
        }
      );
      assistantText = response.content;
      stdout.write(assistantText);
    }

    stdout.write('\n');

    state.messages.push({
      role: 'assistant',
      content: assistantText,
    });

    const assistantTurn = await appendConversationTurn(store, {
      role: 'assistant',
      text: assistantText,
    });
    persistTurnToDatabase(assistantTurn, state.project);
    // Also persist to core_api for semantic extraction
    persistTurnToCoreApi(assistantTurn, state.project).catch(() => {
      // Silently ignore core_api errors
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stdout.write('\n');
    logger.error(`Chat request failed: ${message}`);
  }
}

/**
 * Check if Core API is available
 */
async function checkCoreApiAvailable(): Promise<boolean> {
  try {
    const client = getCoreClient();
    await client.health();
    return true;
  } catch {
    return false;
  }
}

async function handleChatCommand(
  input: string,
  state: SessionState,
  store: ConversationStore | null,
  workspaceDir: string,
): Promise<ChatCommandResult> {
  const [rawCommand, ...parts] = input.slice(1).trim().split(/\s+/);
  if (!rawCommand) {
    return { type: 'none' };
  }

  const command = rawCommand.toLowerCase();

  switch (command) {
    case 'help':
      printChatHelp();
      return { type: 'none' };
    case 'config':
      return { type: 'enterConfig' };
    case 'project': {
      if (parts.length === 0) {
        await printProjectList(state.project);
        return { type: 'none' };
      }
      const projectName = parts[0];
      const exists = await projectExistsViaApi(projectName);
      if (!exists) {
        logger.warn(`Conversation project "${projectName}" does not exist. Use /new ${projectName} to create.`);
        return { type: 'none' };
      }
      setCurrentProjectName(projectName);
      return { type: 'switchProject', project: projectName };
    }
    case 'new': {
      if (parts.length === 0) {
        logger.warn('Usage: /new <conversation_name>');
        return { type: 'none' };
      }
      const projectName = parts[0];
      try {
        await createProjectViaApi(projectName);
        logger.info(`Conversation project "${projectName}" created. Use /project ${projectName} to switch.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to create project: ${message}`);
      }
      return { type: 'none' };
    }
    case 'clear':
    case 'reset':
      return { type: 'resetConversation' };
    default:
      logger.warn(`Unknown command: /${rawCommand}. Type /help to see available commands.`);
      return { type: 'none' };
  }
}

async function handleConfigMode(
  input: string,
  state: SessionState,
  store: ConversationStore | null,
  workspaceDir: string,
): Promise<ConfigCommandResult> {
  if (!input.startsWith('/')) {
    logger.warn('In configuration mode, please start commands with /.');
    return 'stay';
  }

  const [rawCommand, ...parts] = input.slice(1).trim().split(/\s+/);
  if (!rawCommand) {
    return 'stay';
  }

  const command = rawCommand.toLowerCase();

  switch (command) {
    case 'help':
      printConfigHelp();
      return 'stay';
    case 'api':
      if (parts.length === 0) {
        await showApiKey(state.overrides);
      } else {
        const key = parts.join(' ');
        await setApiKey(key, state.overrides);
      }
      return 'stay';
    case 'model':
      if (parts.length === 0) {
        await showModel(state.overrides);
      } else {
        const model = parts.join(' ');
        await setModel(model, state.overrides);
      }
      return 'stay';
    case 'stream':
      if (parts.length === 0) {
        logger.info(`Current streaming output: ${state.stream ? 'on' : 'off'}`);
      } else {
        const value = parts[0].toLowerCase();
        if (value === 'on') {
          state.stream = true;
          logger.info('Streaming output enabled.');
        } else if (value === 'off') {
          state.stream = false;
          logger.info('Streaming output disabled.');
        } else {
          logger.warn('Usage: /stream on|off');
        }
      }
      return 'stay';
    case 'param':
      await showParamSummary(state);
      return 'stay';
    case 'file':
      showFileInfo(workspaceDir, store);
      return 'stay';
    case 'proxy':
      await showProxyStatus();
      return 'stay';
    case 'back':
      return 'back';
    default:
      logger.warn(`Unknown configuration command: /${rawCommand}. Type /help to see list.`);
      return 'stay';
  }
}

async function logInitialGuidance(state: SessionState): Promise<void> {
  const currentModel = await resolveModelName(state.overrides);
  logWelcomeBanner(currentModel);
  stdout.write('\n');
  printChatHelp();
  stdout.write('\n');
  logger.info('Type message to start conversation');
  flushProxyActivationNotice();
}

function logWelcomeBanner(model: string): void {
  const horizontal = '─'.repeat(BANNER_INNER_WIDTH);
  const lines = [
    `╭${horizontal}╮`,
    formatBannerLine(`^_^ contextflow  (${APP_VERSION})`),
    formatBannerLine(''),
    formatBannerLine(buildModelLine(model)),
    formatBannerLine('Happy chatting!'),
    `╰${horizontal}╯`,
  ];
  const formatted = lines
    .map((line, index) => (index === 0 ? line : `   ${line}`))
    .join('\n');
  logger.info(formatted);
}

function formatBannerLine(content: string): string {
  const base = content ?? '';
  const clipped = clipToWidth(base, BANNER_INNER_WIDTH);
  const padding = BANNER_INNER_WIDTH - stringDisplayWidth(clipped);
  return `│${clipped}${' '.repeat(padding)}│`;
}

function buildModelLine(model: string): string {
  const label = `model: '${model}'`;
  const suffix = ' /model to change';
  if (label.length + suffix.length <= BANNER_INNER_WIDTH - 1) {
    return `${label}${suffix}`;
  }
  return label;
}

function clipToWidth(value: string, maxWidth: number): string {
  let width = 0;
  let result = '';

  for (const char of value) {
    const charWidth = getCharWidth(char);
    if (width + charWidth > maxWidth) {
      break;
    }
    result += char;
    width += charWidth;
  }

  return result;
}

function stringDisplayWidth(value: string): number {
  let width = 0;
  for (const char of value) {
    width += getCharWidth(char);
  }
  return width;
}

function getCharWidth(char: string): number {
  if (!char) {
    return 0;
  }
  const code = char.codePointAt(0);
  if (!code) {
    return 0;
  }
  if (
    (code >= 0x1100 && code <= 0x11ff) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0x9fff) || // CJK Radicals/Kanji
    (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
    (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
    (code >= 0xff01 && code <= 0xff60) || // Full-width ASCII variants
    (code >= 0xffe0 && code <= 0xffe6)
  ) {
    return 2;
  }
  return 1;
}

type HelpEntry = {
  usage: string;
  description: string;
};

const CHAT_HELP_ENTRIES: HelpEntry[] = [
  { usage: '/help', description: 'Show help' },
  { usage: '/new NAME', description: 'Create new conversation project' },
  { usage: '/delete NAME', description: 'Delete project and all data (--force to skip confirm)' },
  { usage: '/config', description: 'Enter configuration mode to set API Key and model' },
  { usage: '/project NAME', description: 'Switch to or view current conversation project' },
  { usage: '/clear|/reset', description: 'Clear current conversation context' },
  { usage: '/status', description: 'View SQLite statistics and counts' },
  {
    usage: '/turns [opts]',
    description: 'View recent turns by limit/role (e.g. /turns --n 5 --role user)',
  },
  { usage: '/draft [kind]', description: 'Create new note/plan draft (summary|plan|note)' },
  { usage: '/commit ID', description: 'Commit draft, optionally with --msg "..."' },
  { usage: '/validate', description: 'Execute data consistency validation' },
  { usage: '/ui_init [opts]', description: 'Start local WebUI/API (supports --port/--token)' },
  { usage: '/exit|/quit', description: 'Exit CLI' },
];

const CHAT_HELP_USAGE_PAD = 18;

function printChatHelp(): void {
  logger.info('Available commands:');
  CHAT_HELP_ENTRIES.forEach((entry) => {
    const usage = entry.usage.padEnd(CHAT_HELP_USAGE_PAD);
    logger.info(`  ${usage}${entry.description}`);
  });
}

function printConfigHelp(): void {
  logger.info('Configuration mode commands:');
  logger.info('  /help              Show help information');
  logger.info('  /api [KEY]         View or update ANTHROPIC_API_KEY');
  logger.info('  /model [NAME]      View or update default model');
  logger.info('  /proxy             View current/default proxy');
  logger.info('  /stream on|off     Toggle streaming output');
  logger.info('  /param             View model, API Key, proxy, and other parameters');
  logger.info('  /file              View workspace and conversation log paths');
  logger.info('  /back              Return to chat mode');
}

function flushProxyActivationNotice(): void {
  if (proxyActivationPending) {
    logger.info('Proxy enabled');
    proxyActivationPending = false;
  }
}

async function setApiKey(value: string, overrides: SessionOverrides): Promise<void> {
  await updateUserConfig((config) => ({
    ...config,
    ANTHROPIC_API_KEY: value,
  }));

  overrides.apiKey = value;
  process.env.ANTHROPIC_API_KEY = value;
  process.env.CLAUDE_API_KEY = value;
  process.env.OPENAI_API_KEY = value;
  logger.info('ANTHROPIC_API_KEY updated.');
}

async function showApiKey(overrides: SessionOverrides): Promise<void> {
  const config = await readUserConfig();
  const candidate =
    overrides.apiKey ??
    process.env.ANTHROPIC_API_KEY ??
    process.env.ANTHROPIC_APIKEY ??
    process.env.CLAUDE_API_KEY ??
    process.env.OPENAI_API_KEY ??
    process.env.OPENAI_APIKEY ??
    config.ANTHROPIC_API_KEY ??
    config.OPENAI_API_KEY;

  if (!candidate) {
    logger.info('ANTHROPIC_API_KEY not currently set.');
    return;
  }

  logger.info(`Current ANTHROPIC_API_KEY: ${maskSecret(candidate)}`);
}

async function setModel(value: string, overrides: SessionOverrides): Promise<void> {
  await updateUserConfig((config) => ({
    ...config,
    defaultModel: value,
  }));

  overrides.model = value;
  process.env.CLAUDE_MODEL = value;
  process.env.OPENAI_MODEL = value;
  logger.info(`Default model updated to ${value}.`);
}

async function showModel(overrides: SessionOverrides): Promise<void> {
  const current = await resolveModelName(overrides);
  logger.info(`Current default model: ${current}`);
}

async function hydrateConversationFromStore(
  store: ConversationStore,
  state: SessionState,
): Promise<void> {
  try {
    const turns = await store.loadTurns();
    state.messages = buildMessagesFromTurns(turns);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to load conversation history: ${message}`);
    state.messages = [];
  }
}

async function hydrateSessionMessages(
  store: ConversationStore | null,
  state: SessionState,
): Promise<void> {
  if (store) {
    await hydrateConversationFromStore(store, state);
    return;
  }

  if (!sqliteEnabled || !sqliteReady) {
    state.messages = [];
    return;
  }

  try {
    const rows = listTurns({ project: state.project, limit: 200 });
    const turns = rows
      .map((row) => convertTurnRecordToConversationTurn(row))
      .reverse();
    state.messages = buildMessagesFromTurns(turns);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to load history from SQLite: ${message}`);
    state.messages = [];
  }
}

function convertTurnRecordToConversationTurn(record: TurnRecord): ConversationTurn {
  const role: ConversationTurn['role'] =
    record.role === 'user' || record.role === 'assistant' ? record.role : 'system';
  return {
    id: `turn-sqlite-${record.id}`,
    role,
    text: record.text,
    timestamp: record.ts,
  };
}

function buildMessagesFromTurns(turns: ConversationTurn[]): ChatMessage[] {
  if (turns.length === 0) {
    return [];
  }

  const systemMessages: ChatMessage[] = [];
  const conversationMessages: ChatMessage[] = [];

  for (const turn of turns) {
    const message = convertTurnToMessage(turn);
    if (!message) {
      continue;
    }
    if (turn.role === 'system') {
      systemMessages.push(message);
    } else {
      conversationMessages.push(message);
    }
  }

  const truncated = truncateConversation(conversationMessages);
  return [...systemMessages, ...truncated];
}

function convertTurnToMessage(turn: ConversationTurn): ChatMessage | null {
  if (turn.role === 'system' || turn.role === 'user' || turn.role === 'assistant') {
    return {
      role: turn.role,
      content: turn.text,
    };
  }
  return null;
}

function truncateConversation(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_MEMORY_TURNS) {
    return messages;
  }

  const overflow = messages.slice(0, messages.length - MAX_MEMORY_TURNS);
  const recent = messages.slice(-MAX_MEMORY_TURNS);
  const summary = buildHistorySummary(overflow);
  if (summary) {
    return [{ role: 'system', content: summary }, ...recent];
  }
  return recent;
}

function buildHistorySummary(messages: ChatMessage[]): string {
  if (messages.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('Earlier conversation summary (truncated):');

  messages.forEach((msg, index) => {
    const speakerLabel = msg.role === 'assistant' ? 'Assistant' : 'User';
    lines.push(`${index + 1}. ${speakerLabel}: ${msg.content}`);
  });

  let summary = lines.join('\n');
  if (summary.length > HISTORY_SUMMARY_CHAR_LIMIT) {
    summary = `${summary.slice(0, HISTORY_SUMMARY_CHAR_LIMIT)}\n...[Content truncated]`;
  }
  return summary;
}

async function resolveModelName(overrides: SessionOverrides): Promise<string> {
  const config = await readUserConfig();
  return (
    overrides.model ??
    process.env.CLAUDE_MODEL ??
    process.env.OPENAI_MODEL ??
    config.defaultModel ??
    DEFAULT_MODEL
  );
}

async function showParamSummary(state: SessionState): Promise<void> {
  await showApiKey(state.overrides);
  await showModel(state.overrides);
  await showProxyStatus();
  logger.info(`Streaming output: ${state.stream ? 'on' : 'off'}`);
}

async function updateUserConfig(mutator: (config: UserConfig) => UserConfig): Promise<void> {
  const current = await readUserConfig();
  const updated = mutator(current);
  await writeUserConfig(updated);
}

function maskSecret(value: string): string {
  if (value.length <= 8) {
    return `${value.slice(0, 2)}***${value.slice(-1)}`;
  }
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

async function ensureProxyConfigured(): Promise<void> {
  const currentEnvProxy = getProxyFromEnv();
  const userConfig = await readUserConfig();
  const storedProxy = userConfig.proxyUrl;
  const defaultProxy = currentEnvProxy ?? storedProxy;

  if (!stdin.isTTY) {
    if (!currentEnvProxy && storedProxy) {
      applyProxyToEnv(storedProxy);
    }
    return;
  }

  const promptMessage = defaultProxy
    ? `Enter current VPN/proxy address (press Enter to use ${defaultProxy}, type 'none' to disable proxy):`
    : 'Enter current VPN/proxy address (e.g. 127.0.0.1:10808, press Enter to skip proxy):';

  const answer = await promptForProxy(promptMessage);
  const trimmed = answer.trim();

  let desiredProxy: string | undefined;
  if (!trimmed) {
    desiredProxy = defaultProxy;
  } else if (trimmed.toLowerCase() === 'none') {
    desiredProxy = undefined;
  } else {
    desiredProxy = trimmed;
  }

  if (desiredProxy) {
    applyProxyToEnv(desiredProxy);
    if (desiredProxy !== storedProxy) {
      await updateUserConfig((config) => ({
        ...config,
        proxyUrl: desiredProxy,
      }));
      logger.info(`Proxy address saved, will be used by default next time: ${desiredProxy}.`);
    }
    return;
  }

  clearProxyEnv();
  if (storedProxy) {
    await updateUserConfig((config) => {
      const updated = { ...config };
      delete updated.proxyUrl;
      return updated;
    });
    logger.info('Default proxy settings cleared.');
  } else {
    logger.info('Proxy not enabled for this session.');
  }
}

async function promptForProxy(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
    terminal: true,
  });

  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

function applyProxyToEnv(value: string): void {
  const env = process.env;
  env.https_proxy = value;
  env.http_proxy = value;
  env.HTTPS_PROXY = value;
  env.HTTP_PROXY = value;
  env.ALL_PROXY = value;
  env.all_proxy = value;
}

function clearProxyEnv(): void {
  const env = process.env;
  delete env.https_proxy;
  delete env.http_proxy;
  delete env.HTTPS_PROXY;
  delete env.HTTP_PROXY;
  delete env.ALL_PROXY;
  delete env.all_proxy;
}

function getProxyFromEnv(): string | undefined {
  const env = process.env;
  return (
    env.https_proxy ??
    env.http_proxy ??
    env.HTTPS_PROXY ??
    env.HTTP_PROXY ??
    env.ALL_PROXY ??
    env.all_proxy ??
    undefined
  );
}

async function normalizeProxyEnv(): Promise<void> {
  const env = process.env;
  if (!env.http_proxy && env.HTTP_PROXY) {
    env.http_proxy = env.HTTP_PROXY;
  }
  if (!env.https_proxy && env.HTTPS_PROXY) {
    env.https_proxy = env.HTTPS_PROXY;
  }
  if (!env.no_proxy && env.NO_PROXY) {
    env.no_proxy = env.NO_PROXY;
  }
  const proxy = normalizeProxyUrl(
    env.https_proxy ??
      env.http_proxy ??
      env.HTTPS_PROXY ??
      env.HTTP_PROXY ??
      env.ALL_PROXY ??
      env.all_proxy ??
      undefined,
  );
  if (!proxy) {
    return;
  }

  const undici = await loadUndiciModule();
  if (!undici) {
    logger.warn('undici module not found, skipping proxy configuration.');
    return;
  }

  try {
    const agent = new undici.ProxyAgent(proxy);
    undici.setGlobalDispatcher(agent);
    proxyActivationPending = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Proxy configuration failed: ${message}`);
  }
}

function normalizeProxyUrl(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) {
    return trimmed;
  }

  return `http://${trimmed}`;
}

type UndiciModule = {
  ProxyAgent: new (uri: string) => unknown;
  setGlobalDispatcher: (dispatcher: unknown) => void;
};

async function loadUndiciModule(): Promise<UndiciModule | null> {
  try {
    return (await import('node:undici')) as UndiciModule;
  } catch {
    try {
      return (await import('undici')) as UndiciModule;
    } catch {
      return null;
    }
  }
}

async function showProxyStatus(): Promise<void> {
  const config = await readUserConfig();
  const activeProxy = getProxyFromEnv();
  logger.info(`Current proxy: ${activeProxy ?? '<Not enabled>'}`);
  logger.info(`Default proxy: ${config.proxyUrl ?? '<Not set>'}`);
}

function showFileInfo(workspaceDir: string, store: ConversationStore | null): void {
  logger.info(`Workspace: ${workspaceDir}`);
  if (store) {
    logger.info(`Conversation log: ${store.filePath}`);
  } else {
    logger.info('Conversation log: <JSONL disabled via storageMode>');
  }
}

async function appendConversationTurn(
  store: ConversationStore | null,
  input: { role: 'user' | 'assistant'; text: string },
): Promise<ConversationTurn> {
  if (store) {
    return store.appendTurn({
      role: input.role,
      text: input.text,
    });
  }

  return {
    id: `turn-${randomUUID()}`,
    role: input.role,
    text: input.text,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Persist turn to local SQLite (optional cache, secondary storage)
 * Primary storage is now Core API
 */
function persistTurnToLocalCache(turn: ConversationTurn, project: string): void {
  if (!sqliteEnabled || !sqliteReady) {
    return;
  }

  if (turn.role !== 'user' && turn.role !== 'assistant') {
    return;
  }

  try {
    createTurn({
      project,
      role: turn.role,
      text: turn.text,
      at: turn.timestamp,
      tags: [`project:${project}`],
    });
    logger.trace('sql', `Turn cached locally for project ${project}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.trace('sql', `Local cache write failed: ${message}`);
  }
}

/**
 * Persist turn to Core API (primary storage with semantic extraction)
 */
async function persistTurnToCoreApi(
  turn: ConversationTurn,
  project: string
): Promise<void> {
  if (turn.role !== 'user' && turn.role !== 'assistant') {
    return;
  }

  try {
    // Get project ID and conversation ID
    let projectId: string | undefined = getProjectIdByName(project);

    // If project doesn't exist in Core API, try to create it
    if (!projectId) {
      try {
        projectId = await createProjectViaApi(project);
        logger.trace('cache', `Created project "${project}" in Core API`);
      } catch (createError) {
        // If creation fails (e.g., already exists), try to sync cache
        await syncCache();
        projectId = getProjectIdByName(project);
        if (!projectId) {
          logger.trace('cache', `Project ${project} not in Core API, skipping turn persist`);
          return;
        }
      }
    }

    let conversationId: string | undefined = getCurrentConversationId();

    // Validate that the conversation belongs to the current project
    if (conversationId) {
      const cachedConv = getCachedConversation(conversationId);
      if (!cachedConv || cachedConv.project_id !== projectId) {
        // Conversation belongs to a different project, need to refresh
        logger.trace('cache', `Conversation ${conversationId} belongs to different project, refreshing`);
        conversationId = undefined;
      }
    }

    if (!conversationId) {
      // Need to ensure we have a conversation for this project
      const result = await ensureConversationForProject(project);
      conversationId = result.conversationId;
    }

    if (projectId && conversationId) {
      await createTurnViaApi(projectId, conversationId, turn.role, turn.text);
      logger.trace('cache', `Turn persisted to Core API for project ${project}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.trace('cache', `Core API turn write failed: ${message}`);
  }
}

/**
 * Legacy alias for backward compatibility
 * @deprecated Use persistTurnToLocalCache instead
 */
function persistTurnToDatabase(turn: ConversationTurn, project: string): void {
  persistTurnToLocalCache(turn, project);
}

async function handleSlashCommand(
  cmdline: string,
  state: SessionState,
  workspaceDir: string,
  rl: import('node:readline/promises').Interface,
): Promise<boolean> {
  if (!cmdline.startsWith('/')) {
    return false;
  }

  const body = cmdline.slice(1).trim();
  if (!body) {
    return false;
  }

  const [rawCommand, ...rest] = body.split(/\s+/);
  if (!rawCommand) {
    return false;
  }

  const command = rawCommand.toLowerCase();

  switch (command) {
    case 'status': {
      // Try core_api first
      try {
        const apiStatus = await getSystemStatusViaApi();
        logger.info('=== core_api status ===');
        logger.info(`projects: ${apiStatus.projects_count}`);
        logger.info(`conversations: ${apiStatus.conversations_count}`);
        logger.info(`turns: ${apiStatus.turns_count}`);
        logger.info(`commits: ${apiStatus.commits_count}`);
      } catch {
        logger.info('core_api unavailable');
      }

      // Also show local SQLite status
      if (sqliteEnabled && sqliteReady) {
        try {
          const snapshot = status();
          logger.info('=== Local SQLite status ===');
          logger.info(`generation=${snapshot.generation}`);
          logger.info(
            `counts => turns:${snapshot.counts.turns} drafts:${snapshot.counts.drafts} commits:${snapshot.counts.commits} events:${snapshot.counts.events}`,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn(`Local SQLite query failed: ${message}`);
        }
      }
      return true;
    }
    case 'turns': {
      const opts = parseFlagOptions(rest);
      const positional = rest.filter((token) => !token.startsWith('--'));
      const limitCandidate = opts.n ?? opts.limit ?? positional[0];
      const parsedLimit = limitCandidate ? Number(limitCandidate) : 20;
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;
      const roleFilter =
        opts.role === 'user' || opts.role === 'assistant' || opts.role === 'tool'
          ? (opts.role as TurnRole)
          : undefined;

      // Try core_api first, fall back to local SQLite
      const projectId = getProjectIdByName(state.project);
      if (projectId) {
        try {
          const turns = await listTurnsViaApi(projectId, {
            role: roleFilter,
            limit,
          });
          if (turns.length === 0) {
            logger.info('No turn records yet.');
          } else {
            turns.forEach((turn) => {
              const preview = turn.content.length > 80 ? `${turn.content.slice(0, 77)}...` : turn.content;
              logger.info(`[${turn.role}] ${preview}`);
            });
          }
          return true;
        } catch {
          // Fall back to local SQLite
        }
      }

      // Fallback to local SQLite
      return runDbCommand(() => {
        const rows = listTurns({ project: state.project, limit, role: roleFilter });
        if (rows.length === 0) {
          logger.info('No turn records yet.');
          return;
        }
        rows.forEach((row) => {
          const preview = row.text.length > 80 ? `${row.text.slice(0, 77)}...` : row.text;
          logger.info(`#${row.id} [${row.role}] ${preview}`);
        });
      });
    }
    case 'draft': {
      // /draft --api <bridge_id> <intent> - create via core_api
      // /draft show <draft_id> - show draft details
      // /draft feedback <draft_id> <feedback_text> - update with feedback
      // /draft <kind> - legacy local draft

      const subcommand = rest[0];

      // /draft show <draft_id>
      if (subcommand === 'show') {
        const draftId = rest[1];
        if (!draftId) {
          logger.warn('Usage: /draft show <draft_id>');
          return true;
        }

        try {
          const draft = await getDraftViaApi(draftId);
          logger.info(`Draft #${draft.draft_id}`);
          logger.info(`status: ${draft.status}`);
          logger.info(`Bridge: ${draft.bridge_id}`);
          logger.info(`Intent: ${draft.intent}`);
          logger.info(`Validation: ${draft.validation_passed ? 'Passed' : 'Failed'}`);
          logger.info(`Must-Have: ${draft.must_have.join(', ') || '(none)'}`);
          logger.info(`Mustn't-Have: ${draft.mustnt_have.join(', ') || '(none)'}`);
          logger.info('---');
          logger.info(draft.text || '(no content)');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`Failed to get draft: ${message}`);
        }
        return true;
      }

      // /draft feedback <draft_id> <feedback_text> [--must <keyword>...]
      if (subcommand === 'feedback') {
        const draftId = rest[1];
        if (!draftId) {
          logger.warn('Usage: /draft feedback <draft_id> <feedback_text> [--must <keyword>...]');
          return true;
        }

        // Parse feedback and --must keywords
        const mustIndex = rest.indexOf('--must');
        let feedback: string;
        let appendMustHave: string[] = [];

        if (mustIndex > 2) {
          feedback = rest.slice(2, mustIndex).join(' ');
          appendMustHave = rest.slice(mustIndex + 1);
        } else {
          feedback = rest.slice(2).join(' ');
        }

        if (!feedback && appendMustHave.length === 0) {
          logger.warn('Please provide feedback or --must keywords');
          return true;
        }

        try {
          logger.info(`Updating draft #${draftId}...`);
          const draft = await updateDraftViaApi(draftId, {
            feedback: feedback || undefined,
            append_must_have: appendMustHave.length > 0 ? appendMustHave : undefined,
          });

          if (draft.status === 'ready') {
            logger.info(`✅ Draft updated successfully #${draft.draft_id}`);
            logger.info(`Validation: ${draft.validation_passed ? 'Passed' : 'Failed'}`);
            logger.info(`Must-Have: ${draft.must_have.join(', ') || '(none)'}`);
            logger.info('---');
            logger.info(draft.text || '(no content)');
          } else {
            logger.warn(`⚠️ Draft update failed #${draft.draft_id}`);
            logger.info(`status: ${draft.status}`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`Failed to update draft: ${message}`);
        }
        return true;
      }

      // Check for --api flag to use core_api
      const useApi = rest.includes('--api');
      const filteredRest = rest.filter((t) => t !== '--api');

      if (useApi) {
        // /draft --api <bridge_id> <intent>
        // bridge_id: plan | summary | explain | clarify
        const projectId = getProjectIdByName(state.project);
        if (!projectId) {
          logger.warn(`Project "${state.project}" not created in core_api. Please use /new to create project first.`);
          return true;
        }

        const conversationId = getCurrentConversationId();
        if (!conversationId) {
          logger.warn('No active conversation. Please send a message first.');
          return true;
        }

        // Parse bridge_id and intent
        const bridgeIdArg = filteredRest[0] || 'summary';
        const validBridges = ['plan', 'summary', 'explain', 'clarify'];
        const bridgeId = validBridges.includes(bridgeIdArg)
          ? (bridgeIdArg as 'plan' | 'summary' | 'explain' | 'clarify')
          : 'summary';

        const intent = filteredRest.slice(validBridges.includes(filteredRest[0]) ? 1 : 0).join(' ') || 'Generate content';

        try {
          logger.info(`Generating draft (${bridgeId})...`);
          const draft = await createDraftViaApi(projectId, conversationId, bridgeId, intent);

          if (draft.status === 'ready') {
            logger.info(`✅ Draft generated successfully #${draft.draft_id}`);
            logger.info(`Validation: ${draft.validation_passed ? 'Passed' : 'Failed'}`);
            logger.info(`Must-Have: ${draft.must_have.join(', ') || '(none)'}`);
            logger.info('---');
            logger.info(draft.text || '(no content)');
          } else {
            logger.warn(`⚠️ Draft generation failed #${draft.draft_id}`);
            logger.info(`status: ${draft.status}`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`Failed to generate draft: ${message}`);
        }
        return true;
      }

      // Legacy local draft
      return runDbCommand(() => {
        const kindCandidate = filteredRest.find((token) => !token.startsWith('--')) ?? 'summary';
        const kind: DraftKind =
          kindCandidate === 'plan' || kindCandidate === 'note' ? (kindCandidate as DraftKind) : 'summary';
        const draft = openDraft(state.project, kind);
        logger.info(`📝 draft opened #${draft.id} (${kind})`);
      });
    }
    case 'commit': {
      return handleCommitCommand(rest, state);
    }
    case 'validate':
      return runDbCommand(() => {
        const result = validateAll();
        result.report.forEach((line) => logger.info(line));
      });
    case 'ui_init':
      return handleUiInit(rest, workspaceDir);
    case 'branch': {
      const projectId = getProjectIdByName(state.project);
      if (!projectId) {
        logger.warn(`Project "${state.project}" not created in core_api. Please use /new to create project first.`);
        return true;
      }

      // /branch - list branches
      // /branch <name> - create and checkout branch
      // /branch -d <name> - delete branch (not implemented yet)
      if (rest.length === 0) {
        try {
          const branches = await listBranchesViaApi(projectId);
          if (branches.length === 0) {
            logger.info('No branches yet.');
          } else {
            branches.forEach((branch) => {
              const marker = branch.is_current ? '* ' : '  ';
              const head = branch.head_commit_hash ? ` (${branch.head_commit_hash.slice(0, 8)})` : '';
              logger.info(`${marker}${branch.name}${head}`);
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`Failed to get branch list: ${message}`);
        }
        return true;
      }

      // Create new branch
      const branchName = rest[0];
      try {
        const branch = await createBranchViaApi(projectId, branchName, { checkout: true });
        logger.info(`Branch "${branch.name}" created and switched.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to create branch: ${message}`);
      }
      return true;
    }
    case 'checkout': {
      const projectId = getProjectIdByName(state.project);
      if (!projectId) {
        logger.warn(`Project "${state.project}" not created in core_api. Please use /new to create project first.`);
        return true;
      }

      if (rest.length === 0) {
        // Show current branch
        try {
          const current = await getCurrentBranchViaApi(projectId);
          logger.info(`Current branch: ${current.current_branch}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`Failed to get current branch: ${message}`);
        }
        return true;
      }

      // Switch to branch
      const targetBranch = rest[0];
      const opts = parseFlagOptions(rest);
      const createIfNotExists = opts.b === '' || opts.create === '';

      try {
        const result = await switchBranchViaApi(projectId, targetBranch, {
          create: createIfNotExists,
        });
        logger.info(`Switched to branch: ${result.current_branch}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to switch branch: ${message}`);
      }
      return true;
    }
    case 'commits':
    case 'log': {
      const projectId = getProjectIdByName(state.project);
      if (!projectId) {
        logger.warn(`Project "${state.project}" not created in core_api. Please use /new to create project first.`);
        return true;
      }

      const opts = parseFlagOptions(rest);
      const limitCandidate = opts.n ?? opts.limit ?? rest.find(t => !t.startsWith('--'));
      const parsedLimit = limitCandidate ? Number(limitCandidate) : 10;
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;

      try {
        const commits = await listCommitsViaApi(projectId, { limit });
        if (commits.length === 0) {
          logger.info('No commit records yet.');
        } else {
          commits.forEach((commit) => {
            const hash = commit.commit_hash.slice(0, 8);
            const msg = commit.message ?? '(no message)';
            const date = new Date(commit.created_at).toLocaleDateString();
            logger.info(`${hash} [${commit.branch}] ${msg} (${date})`);
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to get commit list: ${message}`);
      }
      return true;
    }
    case 'diff': {
      // /diff <base_hash> <target_hash>
      if (rest.length < 2) {
        logger.warn('Usage: /diff <base_commit_hash> <target_commit_hash>');
        return true;
      }

      const baseHash = rest[0];
      const targetHash = rest[1];

      try {
        const diff = await diffCommitsViaApi(baseHash, targetHash);

        if (diff.facet_changes.length === 0 && diff.segment_changes.length === 0) {
          logger.info('No diff.');
          return true;
        }

        if (diff.facet_changes.length > 0) {
          logger.info('=== Facet Changes ===');
          diff.facet_changes.forEach((change) => {
            const sign = change.change_type === 'added' ? '+' : change.change_type === 'removed' ? '-' : '~';
            logger.info(`${sign} ${change.facet}: ${change.target_text ?? change.base_text ?? ''}`);
            if (change.added_keywords.length > 0) {
              logger.info(`  + keywords: ${change.added_keywords.join(', ')}`);
            }
            if (change.removed_keywords.length > 0) {
              logger.info(`  - keywords: ${change.removed_keywords.join(', ')}`);
            }
          });
        }

        if (diff.segment_changes.length > 0) {
          logger.info('=== Segment Changes ===');
          diff.segment_changes.forEach((change) => {
            const sign = change.change_type === 'added' ? '+' : change.change_type === 'removed' ? '-' : '~';
            const preview = change.text.length > 60 ? `${change.text.slice(0, 57)}...` : change.text;
            logger.info(`${sign} ${change.segment_id}: ${preview}`);
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to compute diff: ${message}`);
      }
      return true;
    }
    case 'delete': {
      // /delete <project_name> [--force]
      // Use the main readline interface passed in to avoid conflict
      if (rest.length === 0) {
        logger.warn('Usage: /delete <project_name>');
        logger.warn('  --force  Skip confirmation prompt');
        return true;
      }

      const projectName = rest[0];
      const forceDelete = rest.includes('--force');

      // Check if project exists
      const exists = await projectExistsViaApi(projectName);
      if (!exists) {
        logger.warn(`Project "${projectName}" does not exist.`);
        return true;
      }

      // Confirm deletion unless --force is used
      if (!forceDelete) {
        const answer = await rl.question(
          `Are you sure you want to delete "${projectName}"? This will permanently delete all conversations, turns, commits, and other data. (yes/no): `
        );
        if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
          logger.info('Deletion cancelled.');
          return true;
        }
      }

      try {
        const result = await deleteProjectViaApi(projectName);
        const { cascade_deleted } = result;
        const totalDeleted = cascade_deleted.turns + cascade_deleted.conversations +
          cascade_deleted.commits + cascade_deleted.drafts + cascade_deleted.branches;

        logger.info(`✅ Project "${projectName}" deleted successfully.`);
        if (totalDeleted > 0) {
          logger.info(`   Cascade deleted: ${cascade_deleted.turns} turns, ${cascade_deleted.conversations} conversations, ${cascade_deleted.commits} commits, ${cascade_deleted.drafts} drafts, ${cascade_deleted.branches} branches`);
        }

        // If we deleted the current project, clear state
        if (state.project === projectName) {
          state.project = 'default';
          state.messages = [];
          logger.info('Switched to default project.');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to delete project: ${message}`);
      }
      return true;
    }
    default:
      return false;
  }
}

function runDbCommand(action: () => void): boolean {
  if (!sqliteEnabled || !sqliteReady) {
    logger.warn('SQLite not initialized or disabled, related commands unavailable.');
    return true;
  }

  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`SQLite command execution failed: ${message}`);
  }
  return true;
}

function parseFlagOptions(tokens: string[]): Record<string, string> & { [key: string]: string } {
  const result: Record<string, string> = {};
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token.startsWith('--')) {
      continue;
    }
    const trimmed = token.slice(2);
    if (!trimmed) {
      continue;
    }
    if (trimmed.includes('=')) {
      const [key, value] = trimmed.split('=');
      if (key) {
        result[key] = value ?? 'true';
      }
      continue;
    }
    const next = tokens[i + 1];
    if (next && !next.startsWith('--')) {
      result[trimmed] = next;
      i += 1;
    } else {
      result[trimmed] = 'true';
    }
  }
  return result;
}

async function handleCommitCommand(tokens: string[], state: SessionState): Promise<boolean> {
  const opts = parseFlagOptions(tokens);
  const positional = tokens.filter((token) => !token.startsWith('--'));

  // Check if we should use core_api commit
  // /commit --api [--msg "..."] - commit recent turns to core_api
  // /commit <start_hash> <end_hash> [--msg "..."] - commit specific turn window
  if (opts.api !== undefined || positional.length >= 2) {
    const projectId = getProjectIdByName(state.project);
    if (!projectId) {
      logger.warn(`project "${state.project}" was not created in core_api. Please use /new createproject first.`);
      return true;
    }

    const conversationId = getCurrentConversationId();
    if (!conversationId) {
      logger.warn('No active conversation. Please send a message to create conversation first.');
      return true;
    }

    try {
      let turnWindow: { start_turn_hash: string; end_turn_hash: string };

      if (positional.length >= 2) {
        // Explicit turn window
        turnWindow = {
          start_turn_hash: positional[0],
          end_turn_hash: positional[1],
        };
      } else {
        // Auto-detect from recent turns
        const turns = await listTurnsViaApi(projectId, {
          conversationId,
          limit: 50,
        });

        if (turns.length === 0) {
          logger.warn('Current conversation has no turns, cannot create commit.');
          return true;
        }

        // Use all turns in current conversation
        const sortedTurns = [...turns].sort((a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        turnWindow = {
          start_turn_hash: sortedTurns[0].turn_hash,
          end_turn_hash: sortedTurns[sortedTurns.length - 1].turn_hash,
        };
      }

      const commit = await createCommitViaApi(projectId, conversationId, turnWindow, {
        message: opts.msg,
      });

      logger.info(`✅ commit ${commit.commit_hash.slice(0, 8)} [${commit.branch}]`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create commit: ${message}`);
      return true;
    }
  }

  // Fallback to local draft-based commit
  if (positional.length === 0) {
    logger.warn('Usage:');
    logger.warn('  /commit --api [--msg "..."]  - Commit recent turns to core_api');
    logger.warn('  /commit <start_hash> <end_hash> [--msg "..."]  - Commit specified turn window');
    logger.warn('  /commit <draftId> [--msg "..."]  - Commit local draft');
    return true;
  }

  const draftId = Number(positional[0]);
  if (!Number.isInteger(draftId) || draftId <= 0) {
    logger.warn('draftId must be a positive integer.');
    return true;
  }
  return runDbCommand(() => {
    const result = commitDraft(draftId, opts.msg);
    logger.info(`✅ commit #${result.id} ${result.hash.slice(0, 8)}`);
  });
}

async function handleUiInit(tokens: string[], workspaceDir: string): Promise<boolean> {
  // Show status of both servers
  const embeddedInfo = getEmbeddedServerInfo();
  const legacyInfo = getApiServerInfo();

  if (embeddedInfo) {
    logger.info(`Embedded API server (Ring/Diff/Merge): http://${embeddedInfo.host}:${embeddedInfo.port}`);
  } else {
    logger.warn('Embedded API server not running. Ring extraction, Diff, Merge unavailable.');
  }

  if (legacyInfo) {
    logger.info(`Legacy WebUI API running: http://127.0.0.1:${legacyInfo.port}`);
    if (legacyInfo.token) {
      logger.info(`X-CF-Token: ${legacyInfo.token}`);
    }
    return true;
  }

  // Legacy WebUI API requires SQLite
  if (!sqliteEnabled || !sqliteReady) {
    logger.warn('SQLite not enabled, cannot start legacy WebUI API.');
    return true;
  }

  const opts = parseFlagOptions(tokens);
  const portValue = opts.port ?? opts.p;
  let port = 8765;
  if (portValue && portValue !== 'auto') {
    const parsed = Number(portValue);
    if (Number.isInteger(parsed) && parsed > 0) {
      port = parsed;
    }
  }
  const tokenValue = opts.token;
  const requireToken = tokenValue !== 'none';
  const token = requireToken && tokenValue && tokenValue !== 'true' ? tokenValue : undefined;

  try {
    const info = await startApiServer({
      port,
      contextflowDir: workspaceDir,
      requireToken,
      token,
    });
    logger.info(`Legacy WebUI API started: http://127.0.0.1:${info.port}`);
    if (info.token) {
      logger.info(`Include X-CF-Token in request header: ${info.token}`);
    } else if (requireToken) {
      logger.warn('Failed to generate token. Please check configuration.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to start WebUI: ${message}`);
  }
  return true;
}

async function printProjectList(current: string): Promise<void> {
  try {
    const projects = await listProjectsViaApi();
    if (projects.length === 0) {
      logger.info('No conversation projects created yet. Use /new <name> to create.');
      return;
    }
    logger.info(`Current conversation project: ${current}`);
    const projectNames = projects.map(p => p.name);
    logger.info(`Available projects: ${projectNames.join(', ')}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to get project list: ${message}`);
  }
}
