import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Stage = 'waiting' | 'exchanging' | 'queued' | 'running' | 'done' | 'cancelled' | 'uncertain';

type Task = {
  id: string;
  revision: number;
  state: string;
  chat: string;
  text: string;
  stage: Stage;
  token?: string;
  result?: string;
};

type Run = (token: string) => Promise<string>;

// A single-process, single-account qualification host. Its private temporary directory
// survives restarts within a test and never enters the qualification artifact directory.
export class ChatTasks {
  constructor(readonly directory = mkdtempSync(join(tmpdir(), 't3x-chat-'))) {}

  private all(): Task[] {
    try {
      return JSON.parse(readFileSync(join(this.directory, 'tasks.json'), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  private save(tasks: Task[]) {
    const path = join(this.directory, 'tasks.json');
    writeFileSync(path + '.new', JSON.stringify(tasks), { mode: 0o600 });
    renameSync(path + '.new', path);
  }

  start(text: string, state: string = randomUUID(), chat: string = randomUUID()) {
    const task: Task = { id: randomUUID(), revision: 1, chat, text, state, stage: 'waiting' };
    this.save([...this.all(), task]);
    return task;
  }

  find(state: string) {
    return this.all().find((item) => item.state === state);
  }

  thread(chat: string) {
    return this.all().filter((task) => task.chat === chat);
  }

  private change(state: string, allowed: Stage[], update: (task: Task) => void) {
    const tasks = this.all();
    const task = tasks.find((item) => item.state === state && allowed.includes(item.stage));
    if (!task) return false;
    update(task);
    this.save(tasks);
    return true;
  }

  cancel(state: string) {
    return this.change(state, ['waiting', 'exchanging', 'queued'], (task) => {
      task.stage = 'cancelled';
      task.revision++;
      delete task.token;
    });
  }

  retry(state: string, instruction?: string) {
    const next = randomUUID();
    if (
      !this.change(state, ['waiting', 'exchanging'], (task) => {
        if (instruction !== undefined) {
          task.text = instruction;
          task.revision++;
        }
        task.state = next;
        task.stage = 'waiting';
      })
    )
      throw new Error('The original task is no longer waiting for authorization.');
    return next;
  }

  recover(state: string, run: Run) {
    if (
      this.change(state, ['running'], (task) => {
        task.stage = 'uncertain';
      })
    )
      return;
    return this.resume(state, run);
  }

  beginExchange(state: string) {
    return this.change(state, ['waiting'], (task) => {
      task.stage = 'exchanging';
    });
  }

  storeToken(state: string, token: string) {
    return this.change(state, ['exchanging'], (task) => {
      task.token = token;
      task.stage = 'queued';
    });
  }

  async resume(state: string, run: Run) {
    // Claim synchronously, before dispatch. A restarted host leaves an interrupted
    // running write unconfirmed for readback instead of dispatching it again.
    if (
      !this.change(state, ['queued'], (task) => {
        task.stage = 'running';
      })
    )
      return;
    try {
      const result = await run(this.find(state)!.token!);
      this.change(state, ['running'], (task) => {
        task.stage = 'done';
        task.result = result;
      });
    } catch (error) {
      this.change(state, ['running'], (task) => {
        task.stage = 'uncertain';
      });
      throw error;
    }
  }

  record(chat: string, task: string, result: string) {
    const turn = this.start(task, randomUUID(), chat);
    this.change(turn.state, ['waiting'], (row) => {
      row.stage = 'done';
      row.result = result;
    });
  }

  dispose() {
    rmSync(this.directory, { recursive: true, force: true });
  }
}

export function fixtureChat(callback: URL, issuer: string) {
  const tasks = new ChatTasks();
  const connections = new Map<
    string,
    {
      url: () => URL | undefined;
      exchange: (code: string) => Promise<void>;
      run: Run;
    }
  >();
  const chatUrl = (chat: string) => new URL('/chat/' + chat, callback).href;
  const escape = (text: string) =>
    text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  let count = 0;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', callback.origin);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (request.method !== 'GET' || request.headers.host !== callback.host) {
      response.writeHead(404).end();
      return;
    }
    if (url.pathname === callback.pathname) {
      const state = url.searchParams.get('state') || '';
      const task = tasks.find(state);
      const connection = connections.get(state);
      if (!task || !connection || url.searchParams.get('iss') !== issuer) {
        response.writeHead(400).end();
        return;
      }
      if (url.searchParams.get('error') === 'access_denied') {
        if (task.stage === 'waiting') tasks.cancel(state);
      } else {
        const code = url.searchParams.get('code');
        if (!code || !tasks.beginExchange(state)) {
          response.writeHead(409).end();
          return;
        }
        try {
          await connection.exchange(code);
          await tasks.resume(state, connection.run);
        } catch {
          response.writeHead(502).end('The client could not establish a confirmed task result.');
          return;
        }
      }
      response.writeHead(303, { Location: chatUrl(task.chat) }).end();
      return;
    }
    const [, route, id] = url.pathname.split('/');
    if (route === 'connect' && id) {
      const link = connections.get(id)?.url();
      if (link && tasks.find(id)?.stage === 'waiting') {
        count++;
        response.writeHead(302, { Location: link.href }).end();
        return;
      }
    }
    const turns = route === 'chat' && id ? tasks.thread(id) : [];
    if (!turns.length) {
      response.writeHead(404).end();
      return;
    }
    response
      .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      .end(
        '<main>' +
          turns
            .map(
              (turn) =>
                '<p>' +
                escape(turn.text) +
                '</p><p>' +
                escape(turn.result ?? turn.stage) +
                '</p>' +
                (turn.stage === 'waiting'
                  ? '<a href="/connect/' + encodeURIComponent(turn.state) + '">Authorize in T3X</a>'
                  : '')
            )
            .join('') +
          '</main>'
      );
  });
  return { server, tasks, chatUrl, connections, count: () => count };
}
