import http, { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  commitDraft,
  createTurn,
  listTurns,
  openDraft,
  status,
  updateDraft,
  TurnRole,
  DraftKind,
  DraftState,
} from './core/db';
import { logger } from './runtime/logger';

interface ApiServerOptions {
  port?: number;
  contextflowDir: string;
  requireToken?: boolean;
  token?: string;
}

interface ApiServerInfo {
  port: number;
  token?: string;
}

type RouteHandler = (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<void>;

const LOCK_FILENAME = 'lock.json';
const API_PREFIX = '/api';

let server: http.Server | null = null;
let serverInfo: ApiServerInfo | null = null;
let serverToken: string | undefined;
let lockPath: string | null = null;

export async function startApiServer(options: ApiServerOptions): Promise<ApiServerInfo> {
  if (server) {
    throw new Error('API server 已在运行。');
  }

  const port = await resolvePort(options.port ?? 8765);
  const token =
    options.requireToken === false
      ? undefined
      : options.token ?? randomBytes(12).toString('hex');

  const routes: Record<string, RouteHandler> = {
    'GET /api/status': handleStatus,
    'GET /api/turns': handleListTurns,
    'POST /api/turns': handleCreateTurn,
    'POST /api/drafts/open': handleOpenDraft,
    'PATCH /api/drafts/:id': handleUpdateDraft,
    'POST /api/commit': handleCommitDraft,
  };

  server = http.createServer(async (req, res) => {
    if (!req.url || !req.method) {
      res.writeHead(404);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (!url.pathname.startsWith(API_PREFIX)) {
      res.writeHead(404);
      res.end();
      return;
    }

    if (token && req.headers['x-cf-token'] !== token) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing or invalid X-CF-Token' }));
      return;
    }

    const matchingRoute = matchRoute(req.method, url.pathname, routes);
    if (!matchingRoute) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
      return;
    }

    try {
      await matchingRoute(req, res, url);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (error as Error).message }));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server?.listen(port, '127.0.0.1', () => resolve());
    server?.on('error', reject);
  });

  serverInfo = { port, token };
  serverToken = token;
  lockPath = path.join(options.contextflowDir, LOCK_FILENAME);
  await writeLockFile(lockPath, port, token);
  logger.info(`本地 API 已启动：http://127.0.0.1:${port}`);
  if (token) {
    logger.info(`请在请求时附带 X-CF-Token: ${token}`);
  }
  return serverInfo;
}

export async function stopApiServer(): Promise<void> {
  if (!server) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server?.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  server = null;
  serverInfo = null;
  serverToken = undefined;
  if (lockPath) {
    await removeLockFile(lockPath);
    lockPath = null;
  }
}

export function getApiServerInfo(): ApiServerInfo | null {
  return serverInfo;
}

async function handleStatus(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const snapshot = status();
  sendJson(res, snapshot);
}

async function handleListTurns(_req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const limit = Number(url.searchParams.get('limit') ?? '50');
  const role = url.searchParams.get('role') as TurnRole | null;
  const project = url.searchParams.get('project') ?? 'default';

  const rows = listTurns({
    project,
    role: role ?? undefined,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 50,
  });
  sendJson(res, rows);
}

async function handleCreateTurn(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req);
  if (!body || !body.text || !body.role) {
    sendJson(res, { error: 'role/text 为必填字段' }, 400);
    return;
  }
  const turn = createTurn(
    {
      project: body.project ?? 'default',
      role: body.role as TurnRole,
      text: body.text,
      tags: body.tags,
    },
    'webui',
  );
  sendJson(res, turn, 201);
}

async function handleOpenDraft(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req);
  const project = body?.project ?? 'default';
  const kind = (body?.kind ?? 'summary') as DraftKind;
  const draft = openDraft(project, kind, body?.from, 'webui');
  sendJson(res, draft, 201);
}

async function handleUpdateDraft(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const idMatch = url.pathname.match(/\/api\/drafts\/(\d+)/);
  if (!idMatch) {
    sendJson(res, { error: 'draft id 缺失' }, 400);
    return;
  }
  const draftId = Number(idMatch[1]);
  const body = await readJsonBody(req);
  const patch = {
    content: body?.content,
    state: body?.state as DraftState | undefined,
  };
  const draft = updateDraft(draftId, patch, 'webui');
  sendJson(res, draft);
}

async function handleCommitDraft(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req);
  const draftId = Number(body?.id);
  if (!Number.isInteger(draftId)) {
    sendJson(res, { error: 'id 必须为数字' }, 400);
    return;
  }
  const commit = commitDraft(draftId, body?.msg, 'webui');
  sendJson(res, commit, 201);
}

function sendJson(res: ServerResponse, value: unknown, statusCode = 200): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  } catch {
    return undefined;
  }
}

function matchRoute(
  method: string,
  pathname: string,
  routes: Record<string, RouteHandler>,
): RouteHandler | null {
  if (routes[`${method} ${pathname}`]) {
    return routes[`${method} ${pathname}`];
  }

  if (method === 'PATCH' && pathname.startsWith('/api/drafts/')) {
    return routes['PATCH /api/drafts/:id'] ?? null;
  }

  return null;
}

async function resolvePort(desired: number): Promise<number> {
  return desired;
}

async function writeLockFile(targetPath: string, port: number, token?: string): Promise<void> {
  const payload = {
    pid: process.pid,
    port,
    token: token ?? null,
    startedAt: new Date().toISOString(),
  };
  await fs.writeFile(targetPath, JSON.stringify(payload, null, 2), 'utf-8');
}

async function removeLockFile(targetPath: string): Promise<void> {
  try {
    await fs.unlink(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}
