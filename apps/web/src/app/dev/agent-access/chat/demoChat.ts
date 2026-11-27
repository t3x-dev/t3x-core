import type { Preview, Scenario } from '@/components/project/agent-access/agentAccessPreview';

type Item = { title: string; owner: string; status: string };
export type DemoRepository = { name: string; branch: string; scenario: Scenario; items: Item[] };

export const demoRepositories: DemoRepository[] = [
  {
    name: 'studio/editorial-calendar',
    branch: 'main',
    scenario: 'personal',
    items: [
      { title: 'Year in review', owner: 'Maya', status: 'Draft' },
      { title: 'Winter reading list', owner: 'Sam', status: 'Scheduled' },
    ],
  },
  {
    name: 'studio/release-notes',
    branch: 'main',
    scenario: 'protected',
    items: [
      { title: 'Release checklist', owner: 'Maya', status: 'Draft' },
      { title: 'Migration guide', owner: 'Alex', status: 'Ready' },
    ],
  },
  {
    name: 'studio/import-drafts',
    branch: 'main',
    scenario: 'policy',
    items: [
      { title: 'Intake notes', owner: 'Maya', status: 'Draft' },
      { title: 'Imported outline', owner: 'Alex', status: 'Imported' },
    ],
  },
];

export type ChatId = 'editorial' | 'choose';
type Action = 'read' | 'prepare' | 'commit';
type Change = { kind: 'group' } | { kind: 'owner'; title: string; owner: string };
export type Task = {
  id: string;
  text: string;
  repository: string | null;
  required: Action;
  status: 'waiting' | 'done' | 'review' | 'limited';
  result: string;
  connection?: string;
  committed?: { branch: string; change: Change };
};
export type Conversation = { tasks: Task[] };

const repositoryAddress = /[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*/gi;
const groupStories = 'Group the stories by status.';
const unsupportedRequest = `This demo can list, group, or assign items. Try “${groupStories}”`;
type Request =
  | { kind: 'list' | 'group'; required: Action }
  | { kind: 'assign'; required: Action; item: string; owner: string };

function parseRequest(text: string): Request | null {
  let subject = text
    .replace(repositoryAddress, '@repo')
    .replace(/@repo\s*(?:or|或(?:者)?)\s*@repo/gi, '@repo')
    .replace(/\b(?:in|from|of)\s+(?:@repo|(?:this|the) repository)\b|@repo\s*的?/gi, ' ')
    .replace(/[“”"'‘’`《》]/g, '')
    .replace(/[.。?!？！]+$/u, '')
    .replace(/^(?:请帮我|帮我|请|please\s+|(?:can|could) you\s+)/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  let required: Action = 'read';
  const ending = subject.match(
    /(?:\s+(?:and|then)\s+|\s*(?:并|然后)\s*)(commit(?: (?:it|them|the (?:change|changes)))?|提交(?:更改|改动)?|prepare (?:a |the )?(?:draft|review)|保存(?:为|到)?草稿|准备审阅)$/i
  );
  if (ending) {
    required = /^(?:commit|提交)/i.test(ending[1]) ? 'commit' : 'prepare';
    subject = subject.slice(0, ending.index).trim();
  }
  if (
    /^(?:整理|梳理|归类|汇总)\s*(?:一下\s*)?(?:这个仓库的|仓库的)?(?:选题|条目|内容|草稿)(?:\s*按状态分组)?$|^(?:organize|group|summarize) (?:the |my )?(?:topics|stories|items|drafts|content)(?: by status)?$/i.test(
      subject
    )
  )
    return { kind: 'group', required };
  if (
    required === 'read' &&
    /^(?:列出|查看|看看)(?:这个仓库的|仓库的)?\s*(?:内容|条目|选题|草稿)$|^(?:list|show|read)(?: me)? (?:the |this )?(?:items|topics|stories|contents?|repository contents)$/i.test(
      subject
    )
  )
    return { kind: 'list', required };

  const prepared = /^prepare the first item for review and assign it to (sam|maya|alex)$/i.exec(
    subject
  );
  if (prepared && required === 'read')
    return { kind: 'assign', required: 'prepare', item: 'first', owner: prepared[1] };
  const assignment =
    /^(?:assign|reassign) (.+?) to (sam|maya|alex)$|^(?:把|将)\s*(.+?)\s*(?:的负责人(?:改为|改成|换成)|指派给|分配给)\s*(sam|maya|alex|小林)$/i.exec(
      subject
    );
  if (!assignment) return null;
  const item = (assignment[1] ?? assignment[3]).trim();
  return {
    kind: 'assign',
    required: required === 'read' ? 'commit' : required,
    item: /^(?:the first (?:item|story)|第一项|第一个条目|第一条选题)$/i.test(item)
      ? 'first'
      : item,
    owner: assignment[2] ?? assignment[4],
  };
}

function mentionedRepositories(text: string): string[] {
  return [
    ...new Set(
      Array.from(text.matchAll(repositoryAddress), ([name]) =>
        name.toLowerCase().replace(/\.+$/, '')
      )
    ),
  ];
}

export function startTask(text: string, priorRepository: string | null): Task {
  const names = mentionedRepositories(text);
  const known = (name: string) => demoRepositories.some((repo) => repo.name === name);
  const requested = names.length === 1 ? names[0] : undefined;
  const repository =
    requested ??
    (names.length === 0 && priorRepository && known(priorRepository) ? priorRepository : null);
  const request = parseRequest(text.trim());
  const task: Task = {
    id: crypto.randomUUID(),
    text,
    repository,
    required: request?.required ?? 'read',
    status: 'waiting',
    result: repository
      ? 'Check repository access to continue.'
      : 'Choose the repository for this task.',
  };
  if (requested && !known(requested))
    return {
      ...task,
      status: 'limited',
      result: `The demo has no repository named ${requested}. Choose a sample repository in a new message.`,
    };
  if (names.length > 1 && !request)
    return {
      ...task,
      repository: null,
      status: 'limited',
      result: 'Name one repository per demo task so I can use the right access.',
    };
  if (!request)
    return {
      ...task,
      status: 'limited',
      result: unsupportedRequest,
    };
  return task;
}

export function initialConversation(chatId: ChatId): Conversation {
  const text =
    chatId === 'editorial'
      ? 'Group the stories in studio/editorial-calendar by status.'
      : groupStories;
  return { tasks: [{ ...startTask(text, null), id: `initial-${chatId}` }] };
}

export function runTask(
  task: Task,
  repo: DemoRepository,
  grant: Preview | null,
  resumed: boolean,
  priorTasks: Task[] = []
): Task {
  if (task.status === 'done' || task.status === 'review') return task;
  if (task.repository && task.repository !== repo.name)
    return {
      ...task,
      status: 'limited',
      result: `This task belongs to ${task.repository}. Select that repository to continue.`,
    };
  const mentioned = mentionedRepositories(task.text);
  if (mentioned.length && !mentioned.includes(repo.name))
    return {
      ...task,
      status: 'limited',
      result: `The task names ${mentioned.join(' or ')}. Choose one of those repositories.`,
    };
  const parsed = parseRequest(task.text.trim());
  if (!parsed)
    return {
      ...task,
      status: 'limited',
      result: unsupportedRequest,
    };
  const scoped: Task = { ...task, repository: repo.name };
  const unavailable = (result: string): Task => ({
    ...scoped,
    status: resumed ? 'limited' : 'waiting',
    result,
  });
  if (
    grant?.stage !== 'active' ||
    !Number.isFinite(grant.expiresAt) ||
    (grant.expiresAt ?? 0) <= Date.now()
  ) {
    if (parsed.required === 'read' && repo.scenario === 'policy')
      return unavailable(
        `I need access to ${repo.name}. Reading is sufficient for this task. The missing branch policy only affects writes.`
      );
    return unavailable(`Codex needs access to ${repo.name} to continue this task.`);
  }
  if (grant.scenario === 'offline')
    return {
      ...scoped,
      status: 'limited',
      result: 'The demo client is offline. Reconnect it to resume this task.',
    };

  const group = Array.from(
    new Set(repo.items.map((item) => item.status)),
    (status) =>
      `${status}: ${repo.items
        .filter((item) => item.status === status)
        .map((item) => item.title)
        .join(', ')}`
  ).join(' · ');
  const connection = resumed ? 'Resumed after authorization' : 'Used existing access';
  if (parsed.required === 'read') {
    const details =
      parsed.kind === 'group' ? group : repo.items.map((item) => item.title).join(', ');
    return {
      ...scoped,
      connection,
      status: 'done',
      result: `Demo read from ${repo.name} — ${details}.`,
    };
  }
  if (grant.scenario === 'readonly' || repo.scenario === 'readonly')
    return {
      ...scoped,
      status: 'limited',
      result:
        'This demo MCP connection exposes read tools only. Editing needs a write-capable connection.',
    };
  if (grant.mode === 'read')
    return unavailable(
      'The current grant allows reading. This task needs permission to prepare changes.'
    );
  if (grant.scenario === 'empty' || repo.scenario === 'empty')
    return {
      ...scoped,
      status: 'limited',
      result: 'Choose the first Schema before preparing a fixed Review for this demo task.',
    };
  if (grant.scenario === 'policy' || (repo.scenario === 'policy' && grant.scenario !== 'personal'))
    return unavailable(
      'The saved draft needs an applicable branch policy before Codex can prepare a fixed Review.'
    );
  if (parsed.required === 'commit' && grant.mode === 'prepare')
    return unavailable(
      'The grant allows preparation for review. This task also asks Codex to commit.'
    );

  const savedChanges = priorTasks.flatMap((previous) =>
    previous.status === 'done' &&
    previous.repository === repo.name &&
    previous.committed?.branch === repo.branch
      ? [previous.committed.change]
      : []
  );
  let committedChange: Change = { kind: 'group' };
  let change = `Grouped the items by status — ${group}.`;
  if (parsed.kind === 'assign') {
    const item =
      parsed.item === 'first'
        ? repo.items[0]
        : repo.items.find((entry) => entry.title.toLowerCase() === parsed.item.toLowerCase());
    if (!item)
      return {
        ...scoped,
        status: 'limited',
        result: `The demo could not find “${parsed.item}” in ${repo.name}.`,
      };
    const owner = parsed.owner.replace(
      /^[a-z]+$/i,
      (name) => name[0].toUpperCase() + name.slice(1).toLowerCase()
    );
    const currentOwner = savedChanges.reduce(
      (current, saved) =>
        saved.kind === 'owner' && saved.title === item.title ? saved.owner : current,
      item.owner
    );
    if (currentOwner === owner)
      return {
        ...scoped,
        connection,
        status: 'done',
        result: `Demo check: “${item.title}” already belongs to ${owner}. No change needed.`,
      };
    committedChange = { kind: 'owner', title: item.title, owner };
    change = `“${item.title}” owner: ${currentOwner} → ${owner}.`;
  } else if (savedChanges.some((saved) => saved.kind === 'group')) {
    return {
      ...scoped,
      connection,
      status: 'done',
      result: `Demo check: the items on ${repo.branch} are already grouped — ${group}.`,
    };
  }
  if (
    repo.scenario === 'protected' ||
    grant.scenario === 'protected' ||
    parsed.required === 'prepare'
  ) {
    const reason =
      repo.scenario === 'protected' || grant.scenario === 'protected'
        ? 'An independent reviewer must approve it.'
        : 'Ready for your decision.';
    return {
      ...scoped,
      connection,
      status: 'review',
      result: `Demo fixed Review on ${repo.name} / ${repo.branch}. ${change} ${reason}`,
    };
  }
  return {
    ...scoped,
    connection,
    status: 'done',
    committed: { branch: repo.branch, change: committedChange },
    result: `Demo commit on ${repo.name} / ${repo.branch}. ${change}`,
  };
}
