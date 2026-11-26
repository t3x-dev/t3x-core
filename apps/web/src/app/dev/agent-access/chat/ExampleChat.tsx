'use client';

import { ArrowRight, ArrowUp, Check, MessageSquare, Settings, SquareTerminal } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useRef, useState } from 'react';
import { AgentAccessDemo } from '@/components/project/agent-access/AgentAccessDemo';
import { type Preview, readDemoAccess } from '@/components/project/agent-access/agentAccessPreview';
import {
  type ChatId,
  type Conversation,
  demoRepositories,
  initialConversation,
  runTask,
  startTask,
  type Task,
} from './demoChat';
import s from './ExampleChat.module.css';

const titles = { editorial: 'Editorial planning', choose: 'Choose a repository' };
const root = '/dev/agent-access/chat';
const findRepo = (name: string | null) => demoRepositories.find((repo) => repo.name === name);
const fallback = new Map<ChatId, Conversation>();

function save(chatId: ChatId, chat: Conversation) {
  fallback.set(chatId, chat);
  try {
    sessionStorage.setItem(`t3x.example-chat.v1:${chatId}`, JSON.stringify(chat));
  } catch {
    /* Memory covers this visit. */
  }
}

function attempt(task: Task, history: Task[] = [], resumed = false, consent?: Preview): Task {
  const repo = findRepo(task.repository);
  if (!repo) {
    if (task.repository)
      return {
        ...task,
        status: 'limited',
        result: `This demo has no repository you can authorize at ${task.repository}. Send a task for an available repository.`,
      };
    return task;
  }
  const access = consent ?? readDemoAccess(repo.name, repo.branch, repo.scenario);
  return runTask(task, repo, access, resumed, history);
}

function load(chatId: ChatId): Conversation {
  try {
    const record = sessionStorage.getItem(`t3x.example-chat.v1:${chatId}`);
    if (record) {
      const parsed = JSON.parse(record);
      if (
        Array.isArray(parsed?.tasks) &&
        parsed.tasks.length &&
        parsed.tasks.every((t: Task) => typeof t?.id === 'string' && typeof t.text === 'string')
      )
        return parsed;
    }
  } catch {
    /* Restore from memory if storage is unavailable. */
  }
  const previous = fallback.get(chatId);
  if (previous) return previous;
  const chat = initialConversation(chatId);
  return { ...chat, tasks: chat.tasks.map((task) => attempt(task)) };
}

export function ExampleChat({
  chatId,
  requestId,
  pausedId,
}: {
  chatId: ChatId;
  requestId?: string;
  pausedId?: string;
}) {
  const router = useRouter();
  const [chat, setChat] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState('');
  const [choice, setChoice] = useState('');
  const transcript = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const chatHref = `${root}?chat=${chatId}`;
  useEffect(() => {
    const conversation = load(chatId);
    save(chatId, conversation);
    setChat(conversation);
  }, [chatId]);
  useEffect(() => {
    if (chat && !requestId && transcript.current)
      transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [chat, requestId]);
  if (!chat) return <output className="p-6 text-sm">Opening example chat…</output>;

  const conversation = chat;
  const tasks = conversation.tasks;
  const currentRepo =
    tasks.findLast((task) => task.repository && findRepo(task.repository))?.repository ?? null;

  function change(tasks: Task[]) {
    const updated = { ...conversation, tasks };
    save(chatId, updated);
    setChat(updated);
  }
  function replaceTask(task: Task) {
    change(tasks.map((previous) => (previous.id === task.id ? task : previous)));
  }
  function send(message: string) {
    const text = message.trim();
    if (!text) return;
    const task = startTask(text, currentRepo);
    change([...tasks, attempt(task, tasks)]);
    setDraft('');
    input.current?.focus();
  }
  function connect(task: Task) {
    const updated = attempt(task, tasks);
    if (updated.status !== 'waiting') {
      replaceTask(updated);
      return;
    }
    setChoice('');
    router.push(`${chatHref}&authorize=${encodeURIComponent(task.id)}`);
  }

  const pending = requestId
    ? tasks.find((task) => task.id === requestId && task.status === 'waiting')
    : undefined;
  if (pending) {
    const repo = findRepo(pending.repository ?? choice);
    const backHref = `${chatHref}&paused=${encodeURIComponent(pending.id)}`;
    return (
      <AgentAccessDemo
        key={JSON.stringify([pending.id, repo?.name])}
        repository={repo?.name ?? ''}
        branch={repo?.branch ?? 'main'}
        backHref={backHref}
        backLabel="Return to chat"
        scenario={repo?.scenario}
        request={{
          task: pending.text,
          required: pending.required,
          repositoryPicker: !pending.repository && (
            <label className={s.picker}>
              Repository
              <select
                aria-label="Repository"
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
              >
                <option value="">Choose a repository…</option>
                {demoRepositories.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          ),
          onAuthorized(grant) {
            if (!repo) return;
            replaceTask(attempt({ ...pending, repository: repo.name }, tasks, true, grant));
            router.replace(chatHref, { scroll: false });
          },
        }}
      />
    );
  }

  const last = tasks.at(-1);
  const settings = currentRepo
    ? `/dev/agent-access?${new URLSearchParams({ view: 'settings', repository: currentRepo, chat: chatId })}`
    : null;
  return (
    <div className={s.shell}>
      <aside className={s.sidebar}>
        <div className={s.brand}>
          <SquareTerminal size={21} aria-hidden="true" /> Example Chat
        </div>
        <nav className={s.nav} aria-label="Example chats">
          {(Object.entries(titles) as [ChatId, string][]).map(([id, title]) => (
            <Link
              key={id}
              className={`${s.chatLink} ${id === chatId ? s.active : ''}`}
              aria-current={id === chatId ? 'page' : undefined}
              href={`${root}?chat=${id}`}
            >
              <MessageSquare size={16} aria-hidden="true" />
              {title}
            </Link>
          ))}
        </nav>
        <p className={s.demoNote}>Simulated chat and permissions. All tasks use sample data.</p>
      </aside>
      <div className={s.workspace}>
        <header className={s.header}>
          <div>
            <h1 className={s.title}>{titles[chatId]}</h1>
            <p className={s.sub}>Codex · T3X</p>
          </div>
          {settings && (
            <Link className={s.manage} href={settings}>
              <Settings size={15} aria-hidden="true" />
              Repository settings
            </Link>
          )}
        </header>
        <div
          ref={transcript}
          className={s.transcript}
          role="log"
          aria-label="Chat messages"
          aria-live="polite"
        >
          <div className={s.messages}>
            {tasks.map((task) => (
              <Fragment key={task.id}>
                <div className={`${s.turn} ${s.user}`}>
                  <span className={s.actor}>You</span>
                  <p className={s.response}>{task.text}</p>
                </div>
                <div className={`${s.turn} ${s.assistant}`}>
                  <span className={s.actor}>
                    <SquareTerminal size={15} aria-hidden="true" /> Codex
                  </span>
                  {task.connection && (
                    <p className={s.sub}>
                      <Check size={14} className="inline" aria-hidden="true" /> {task.connection}
                    </p>
                  )}
                  <p className={s.response}>
                    {task.id === pausedId && task.status === 'waiting'
                      ? 'Task paused. You can return to T3X to finish authorization.'
                      : task.result ||
                        (task.repository
                          ? `I need access to ${task.repository} to continue this task.`
                          : 'Choose a T3X repository so I can work on this task.')}
                  </p>
                  {task.status === 'waiting' && (
                    <button className={s.connect} type="button" onClick={() => connect(task)}>
                      Authorize in T3X <ArrowRight size={15} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </Fragment>
            ))}
          </div>
        </div>
        <form
          className={s.composer}
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <div className={s.composeInner}>
            {last && last.status !== 'waiting' && (
              <div className={s.promptRow}>
                <button
                  type="button"
                  className={s.suggestion}
                  onClick={() => send('List the items in this repository.')}
                >
                  List repository items
                </button>
                <button
                  type="button"
                  className={s.suggestion}
                  onClick={() => send('Assign the first item to Sam and commit the change.')}
                >
                  Assign the first item
                </button>
              </div>
            )}
            <div className={s.inputRow}>
              <textarea
                className={s.input}
                ref={input}
                rows={1}
                aria-label="Message Codex"
                placeholder="Message Codex…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
              />
              <button
                type="submit"
                aria-label="Send message"
                className={s.send}
                disabled={!draft.trim()}
              >
                <ArrowUp size={17} aria-hidden="true" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
