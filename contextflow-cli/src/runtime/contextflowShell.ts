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
import { createChatCompletion } from '../providers/claude';
import { ensureDir, pathExists } from '../utils/fs';
import { startApiServer, getApiServerInfo } from '../server';
import { configureLogger, logger } from './logger';
import {
  initProjectCache,
  getCurrentProjectName,
  setCurrentProjectName,
  createProjectViaApi,
  listProjectsViaApi,
  projectExistsViaApi,
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
      logger.warn(`SQLite 初始化失败，相关命令将不可用: ${message}`);
      sqliteReady = false;
    }
  } else {
    logger.info('storageMode=JSONL，仅使用 JSONL 存储。');
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
        const slashHandled = await handleSlashCommand(trimmed, state, root.contextflowDir);
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
          logger.info(`已切换到项目 "${state.project}"。`);
          if (store) {
            logger.info(`Conversation log: ${store.filePath}`);
          }
          continue;
        }

        if (commandResult.type === 'resetConversation') {
          state.messages = [];
          logger.info('已清除当前会话上下文。');
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
    const { apiKey, model } = await resolveRuntimeConfig(state.overrides);

    let streamed = '';
    const completion = await createChatCompletion({
      apiKey,
      model,
      messages: state.messages,
      stream: state.stream,
      onToken: state.stream
        ? (token) => {
            streamed += token;
            stdout.write(token);
          }
        : undefined,
    });

    const assistantText = state.stream ? streamed || completion : completion;

    if (!state.stream) {
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
    logger.error(`Claude 请求失败: ${message}`);
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
        logger.warn(`会话项目 "${projectName}" 不存在。使用 /new ${projectName} 创建。`);
        return { type: 'none' };
      }
      setCurrentProjectName(projectName);
      return { type: 'switchProject', project: projectName };
    }
    case 'new': {
      if (parts.length === 0) {
        logger.warn('用法: /new <会话名称>');
        return { type: 'none' };
      }
      const projectName = parts[0];
      try {
        await createProjectViaApi(projectName);
        logger.info(`会话项目 "${projectName}" 已创建。使用 /project ${projectName} 切换。`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`创建项目失败: ${message}`);
      }
      return { type: 'none' };
    }
    case 'clear':
    case 'reset':
      return { type: 'resetConversation' };
    default:
      logger.warn(`未知命令: /${rawCommand}。输入 /help 查看可用命令。`);
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
    logger.warn('配置模式下请以 / 开头输入命令。');
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
        logger.info(`当前流式输出: ${state.stream ? 'on' : 'off'}`);
      } else {
        const value = parts[0].toLowerCase();
        if (value === 'on') {
          state.stream = true;
          logger.info('流式输出已开启。');
        } else if (value === 'off') {
          state.stream = false;
          logger.info('流式输出已关闭。');
        } else {
          logger.warn('用法: /stream on|off');
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
      logger.warn(`未知配置命令: /${rawCommand}。输入 /help 查看列表。`);
      return 'stay';
  }
}

async function logInitialGuidance(state: SessionState): Promise<void> {
  const currentModel = await resolveModelName(state.overrides);
  logWelcomeBanner(currentModel);
  stdout.write('\n');
  printChatHelp();
  stdout.write('\n');
  logger.info('输入消息可直接对话');
  flushProxyActivationNotice();
}

function logWelcomeBanner(model: string): void {
  const horizontal = '─'.repeat(BANNER_INNER_WIDTH);
  const lines = [
    `╭${horizontal}╮`,
    formatBannerLine(`^_^ contextflow  (${APP_VERSION})`),
    formatBannerLine(''),
    formatBannerLine(buildModelLine(model)),
    formatBannerLine('祝您使用愉快'),
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
  { usage: '/help', description: '显示帮助' },
  { usage: '/new NAME', description: '新建会话项目' },
  { usage: '/config', description: '进入配置模式，设置 API Key 和模型' },
  { usage: '/project NAME', description: '切换或查看当前会话项目' },
  { usage: '/clear|/reset', description: '清空当前会话上下文' },
  { usage: '/status', description: '查看 SQLite 代数与计数信息' },
  {
    usage: '/turns [opts]',
    description: '按 limit/role 查看最近 turn（如 /turns --n 5 --role user）',
  },
  { usage: '/draft [kind]', description: '新建笔记/计划草稿（summary|plan|note）' },
  { usage: '/commit ID', description: '提交草稿，可搭配 --msg "..."' },
  { usage: '/validate', description: '执行数据一致性校验' },
  { usage: '/ui_init [opts]', description: '启动本地 WebUI/API（支持 --port/--token）' },
  { usage: '/exit|/quit', description: '退出 CLI' },
];

const CHAT_HELP_USAGE_PAD = 18;

function printChatHelp(): void {
  logger.info('可用命令:');
  CHAT_HELP_ENTRIES.forEach((entry) => {
    const usage = entry.usage.padEnd(CHAT_HELP_USAGE_PAD);
    logger.info(`  ${usage}${entry.description}`);
  });
}

function printConfigHelp(): void {
  logger.info('配置模式命令:');
  logger.info('  /help              显示帮助信息');
  logger.info('  /api [KEY]         查看或更新 ANTHROPIC_API_KEY');
  logger.info('  /model [NAME]      查看或更新默认模型');
  logger.info('  /proxy             查看当前/默认代理');
  logger.info('  /stream on|off     切换流式输出');
  logger.info('  /param             查看模型、API Key、代理等参数');
  logger.info('  /file              查看 workspace 与会话日志路径');
  logger.info('  /back              返回聊天模式');
}

function flushProxyActivationNotice(): void {
  if (proxyActivationPending) {
    logger.info('已启用代理');
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
  logger.info('ANTHROPIC_API_KEY 已更新。');
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
    logger.info('当前未设置 ANTHROPIC_API_KEY。');
    return;
  }

  logger.info(`当前 ANTHROPIC_API_KEY: ${maskSecret(candidate)}`);
}

async function setModel(value: string, overrides: SessionOverrides): Promise<void> {
  await updateUserConfig((config) => ({
    ...config,
    defaultModel: value,
  }));

  overrides.model = value;
  process.env.CLAUDE_MODEL = value;
  process.env.OPENAI_MODEL = value;
  logger.info(`默认模型已更新为 ${value}。`);
}

async function showModel(overrides: SessionOverrides): Promise<void> {
  const current = await resolveModelName(overrides);
  logger.info(`当前默认模型: ${current}`);
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
    logger.warn(`加载历史对话失败: ${message}`);
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
    logger.warn(`从 SQLite 加载历史失败: ${message}`);
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
  lines.push('以下为较早的对话摘要 (已截断):');

  messages.forEach((msg, index) => {
    const speakerLabel = msg.role === 'assistant' ? '助手' : '用户';
    lines.push(`${index + 1}. ${speakerLabel}: ${msg.content}`);
  });

  let summary = lines.join('\n');
  if (summary.length > HISTORY_SUMMARY_CHAR_LIMIT) {
    summary = `${summary.slice(0, HISTORY_SUMMARY_CHAR_LIMIT)}\n...[内容已截断]`;
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
  logger.info(`流式输出: ${state.stream ? 'on' : 'off'}`);
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
    ? `请输入当前 VPN/代理地址（回车沿用 ${defaultProxy}，输入 none 关闭代理）：`
    : '请输入当前 VPN/代理地址（例如 127.0.0.1:10808，直接回车表示不使用代理）：';

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
      logger.info(`代理地址已保存，下次默认使用 ${desiredProxy}。`);
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
    logger.info('已清除默认代理设置。');
  } else {
    logger.info('本次会话未启用代理。');
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
    logger.warn('未找到 undici 模块，跳过代理配置。');
    return;
  }

  try {
    const agent = new undici.ProxyAgent(proxy);
    undici.setGlobalDispatcher(agent);
    proxyActivationPending = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`代理配置失败: ${message}`);
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
  logger.info(`当前代理: ${activeProxy ?? '<未启用>'}`);
  logger.info(`默认代理: ${config.proxyUrl ?? '<未设置>'}`);
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

function persistTurnToDatabase(turn: ConversationTurn, project: string): void {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`写入 SQLite 失败: ${message}`);
  }
}

async function persistTurnToCoreApi(
  turn: ConversationTurn,
  project: string
): Promise<void> {
  if (turn.role !== 'user' && turn.role !== 'assistant') {
    return;
  }

  try {
    // Get project ID and conversation ID
    const projectId = getProjectIdByName(project);
    if (!projectId) {
      // Project not yet created in core_api, skip
      logger.trace('cache', `Project ${project} not in cache, skipping core_api turn`);
      return;
    }

    let conversationId = getCurrentConversationId();

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

    await createTurnViaApi(projectId, conversationId, turn.role, turn.text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.trace('cache', `core_api turn 写入失败: ${message}`);
  }
}

async function handleSlashCommand(
  cmdline: string,
  state: SessionState,
  workspaceDir: string,
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
        logger.info('=== core_api 状态 ===');
        logger.info(`projects: ${apiStatus.projects_count}`);
        logger.info(`conversations: ${apiStatus.conversations_count}`);
        logger.info(`turns: ${apiStatus.turns_count}`);
        logger.info(`commits: ${apiStatus.commits_count}`);
      } catch {
        logger.info('core_api 不可用');
      }

      // Also show local SQLite status
      if (sqliteEnabled && sqliteReady) {
        try {
          const snapshot = status();
          logger.info('=== 本地 SQLite 状态 ===');
          logger.info(`generation=${snapshot.generation}`);
          logger.info(
            `counts => turns:${snapshot.counts.turns} drafts:${snapshot.counts.drafts} commits:${snapshot.counts.commits} events:${snapshot.counts.events}`,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn(`本地 SQLite 查询失败: ${message}`);
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
            logger.info('暂无 turn 记录。');
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
          logger.info('暂无 turn 记录。');
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
          logger.warn('用法: /draft show <draft_id>');
          return true;
        }

        try {
          const draft = await getDraftViaApi(draftId);
          logger.info(`Draft #${draft.draft_id}`);
          logger.info(`状态: ${draft.status}`);
          logger.info(`Bridge: ${draft.bridge_id}`);
          logger.info(`Intent: ${draft.intent}`);
          logger.info(`验证: ${draft.validation_passed ? '通过' : '失败'}`);
          logger.info(`Must-Have: ${draft.must_have.join(', ') || '(无)'}`);
          logger.info(`Mustn't-Have: ${draft.mustnt_have.join(', ') || '(无)'}`);
          logger.info('---');
          logger.info(draft.text || '(无内容)');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`获取 Draft 失败: ${message}`);
        }
        return true;
      }

      // /draft feedback <draft_id> <feedback_text> [--must <keyword>...]
      if (subcommand === 'feedback') {
        const draftId = rest[1];
        if (!draftId) {
          logger.warn('用法: /draft feedback <draft_id> <feedback_text> [--must <keyword>...]');
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
          logger.warn('请提供反馈内容或 --must 关键词');
          return true;
        }

        try {
          logger.info(`正在更新 Draft #${draftId}...`);
          const draft = await updateDraftViaApi(draftId, {
            feedback: feedback || undefined,
            append_must_have: appendMustHave.length > 0 ? appendMustHave : undefined,
          });

          if (draft.status === 'ready') {
            logger.info(`✅ Draft 更新成功 #${draft.draft_id}`);
            logger.info(`验证: ${draft.validation_passed ? '通过' : '失败'}`);
            logger.info(`Must-Have: ${draft.must_have.join(', ') || '(无)'}`);
            logger.info('---');
            logger.info(draft.text || '(无内容)');
          } else {
            logger.warn(`⚠️ Draft 更新失败 #${draft.draft_id}`);
            logger.info(`状态: ${draft.status}`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`更新 Draft 失败: ${message}`);
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
          logger.warn(`项目 "${state.project}" 未在 core_api 中创建。请先使用 /new 创建项目。`);
          return true;
        }

        const conversationId = getCurrentConversationId();
        if (!conversationId) {
          logger.warn('当前没有活跃的对话。请先发送一条消息。');
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
          logger.info(`正在生成 Draft (${bridgeId})...`);
          const draft = await createDraftViaApi(projectId, conversationId, bridgeId, intent);

          if (draft.status === 'ready') {
            logger.info(`✅ Draft 生成成功 #${draft.draft_id}`);
            logger.info(`验证: ${draft.validation_passed ? '通过' : '失败'}`);
            logger.info(`Must-Have: ${draft.must_have.join(', ') || '(无)'}`);
            logger.info('---');
            logger.info(draft.text || '(无内容)');
          } else {
            logger.warn(`⚠️ Draft 生成失败 #${draft.draft_id}`);
            logger.info(`状态: ${draft.status}`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`生成 Draft 失败: ${message}`);
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
        logger.warn(`项目 "${state.project}" 未在 core_api 中创建。请先使用 /new 创建项目。`);
        return true;
      }

      // /branch - list branches
      // /branch <name> - create and checkout branch
      // /branch -d <name> - delete branch (not implemented yet)
      if (rest.length === 0) {
        try {
          const branches = await listBranchesViaApi(projectId);
          if (branches.length === 0) {
            logger.info('暂无分支。');
          } else {
            branches.forEach((branch) => {
              const marker = branch.is_current ? '* ' : '  ';
              const head = branch.head_commit_hash ? ` (${branch.head_commit_hash.slice(0, 8)})` : '';
              logger.info(`${marker}${branch.name}${head}`);
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`获取分支列表失败: ${message}`);
        }
        return true;
      }

      // Create new branch
      const branchName = rest[0];
      try {
        const branch = await createBranchViaApi(projectId, branchName, { checkout: true });
        logger.info(`分支 "${branch.name}" 已创建并切换。`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`创建分支失败: ${message}`);
      }
      return true;
    }
    case 'checkout': {
      const projectId = getProjectIdByName(state.project);
      if (!projectId) {
        logger.warn(`项目 "${state.project}" 未在 core_api 中创建。请先使用 /new 创建项目。`);
        return true;
      }

      if (rest.length === 0) {
        // Show current branch
        try {
          const current = await getCurrentBranchViaApi(projectId);
          logger.info(`当前分支: ${current.current_branch}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`获取当前分支失败: ${message}`);
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
        logger.info(`已切换到分支: ${result.current_branch}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`切换分支失败: ${message}`);
      }
      return true;
    }
    case 'commits':
    case 'log': {
      const projectId = getProjectIdByName(state.project);
      if (!projectId) {
        logger.warn(`项目 "${state.project}" 未在 core_api 中创建。请先使用 /new 创建项目。`);
        return true;
      }

      const opts = parseFlagOptions(rest);
      const limitCandidate = opts.n ?? opts.limit ?? rest.find(t => !t.startsWith('--'));
      const parsedLimit = limitCandidate ? Number(limitCandidate) : 10;
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;

      try {
        const commits = await listCommitsViaApi(projectId, { limit });
        if (commits.length === 0) {
          logger.info('暂无 commit 记录。');
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
        logger.error(`获取 commit 列表失败: ${message}`);
      }
      return true;
    }
    case 'diff': {
      // /diff <base_hash> <target_hash>
      if (rest.length < 2) {
        logger.warn('用法: /diff <base_commit_hash> <target_commit_hash>');
        return true;
      }

      const baseHash = rest[0];
      const targetHash = rest[1];

      try {
        const diff = await diffCommitsViaApi(baseHash, targetHash);

        if (diff.facet_changes.length === 0 && diff.segment_changes.length === 0) {
          logger.info('无差异。');
          return true;
        }

        if (diff.facet_changes.length > 0) {
          logger.info('=== Facet 变更 ===');
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
          logger.info('=== Segment 变更 ===');
          diff.segment_changes.forEach((change) => {
            const sign = change.change_type === 'added' ? '+' : change.change_type === 'removed' ? '-' : '~';
            const preview = change.text.length > 60 ? `${change.text.slice(0, 57)}...` : change.text;
            logger.info(`${sign} ${change.segment_id}: ${preview}`);
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`计算 diff 失败: ${message}`);
      }
      return true;
    }
    default:
      return false;
  }
}

function runDbCommand(action: () => void): boolean {
  if (!sqliteEnabled || !sqliteReady) {
    logger.warn('SQLite 未初始化或已禁用，相关命令不可用。');
    return true;
  }

  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`SQLite 命令执行失败: ${message}`);
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
      logger.warn(`项目 "${state.project}" 未在 core_api 中创建。请先使用 /new 创建项目。`);
      return true;
    }

    const conversationId = getCurrentConversationId();
    if (!conversationId) {
      logger.warn('当前无活跃会话。请先发送消息创建会话。');
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
          logger.warn('当前会话无 turns，无法创建 commit。');
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
      logger.error(`创建 commit 失败: ${message}`);
      return true;
    }
  }

  // Fallback to local draft-based commit
  if (positional.length === 0) {
    logger.warn('用法：');
    logger.warn('  /commit --api [--msg "..."]  - 提交最近的 turns 到 core_api');
    logger.warn('  /commit <start_hash> <end_hash> [--msg "..."]  - 提交指定 turn 窗口');
    logger.warn('  /commit <draftId> [--msg "..."]  - 提交本地 draft');
    return true;
  }

  const draftId = Number(positional[0]);
  if (!Number.isInteger(draftId) || draftId <= 0) {
    logger.warn('draftId 需为正整数。');
    return true;
  }
  return runDbCommand(() => {
    const result = commitDraft(draftId, opts.msg);
    logger.info(`✅ commit #${result.id} ${result.hash.slice(0, 8)}`);
  });
}

async function handleUiInit(tokens: string[], workspaceDir: string): Promise<boolean> {
  if (!sqliteEnabled || !sqliteReady) {
    logger.warn('SQLite 未启用，无法启动 WebUI。');
    return true;
  }

  const existing = getApiServerInfo();
  if (existing) {
    logger.info(`API 已运行：http://127.0.0.1:${existing.port}`);
    if (existing.token) {
      logger.info(`X-CF-Token: ${existing.token}`);
    }
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
    logger.info(`启动本地 WebUI 接口：http://127.0.0.1:${info.port}`);
    if (info.token) {
      logger.info(`请在请求头附带 X-CF-Token: ${info.token}`);
    } else if (requireToken) {
      logger.warn('未能生成 token。请检查配置。');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`启动 WebUI 失败: ${message}`);
  }
  return true;
}

async function printProjectList(current: string): Promise<void> {
  try {
    const projects = await listProjectsViaApi();
    if (projects.length === 0) {
      logger.info('当前尚未创建任何会话项目。使用 /new <名称> 新建。');
      return;
    }
    logger.info(`当前会话项目: ${current}`);
    const projectNames = projects.map(p => p.name);
    logger.info(`可用项目: ${projectNames.join(', ')}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`获取项目列表失败: ${message}`);
  }
}
