import { describe, expect, it } from 'vitest';
import {
  demoRepositories,
  initialConversation,
  runTask,
  startTask,
} from '@/app/dev/agent-access/chat/demoChat';
import { initial, type Preview } from '@/components/project/agent-access/agentAccessPreview';

const [calendar, releases, imports] = demoRepositories;
const active: Preview = {
  ...initial,
  stage: 'active',
  expiresAt: Date.UTC(2099, 0, 1),
};
const writeTask = (repository: string) =>
  startTask(`Assign the first item to Sam in ${repository} and commit the change.`, null);

describe('agent chat delegation preview', () => {
  it('keeps the original instruction and selects the explicit repository first', () => {
    const named = initialConversation('editorial').tasks[0];
    expect(named).toMatchObject({ repository: calendar.name, status: 'waiting', required: 'read' });
    expect(initialConversation('choose').tasks[0]).toMatchObject({
      repository: null,
      status: 'waiting',
    });
    expect(startTask(`帮我整理 ${releases.name} 的选题`, calendar.name).repository).toBe(
      releases.name
    );
    expect(startTask('帮我整理选题', calendar.name).repository).toBe(calendar.name);
    const waiting = runTask(named, calendar, null, false);
    const result = runTask(waiting, calendar, active, true);
    expect(result).toMatchObject({ id: named.id, text: named.text, status: 'done' });
    expect(result.result).toContain('Draft: Year in review');
    expect(result.result).toContain('Scheduled: Winter reading list');
    expect(result.result).not.toMatch(/commit/i);
  });

  it('reads with existing access even when writing needs a policy', () => {
    const task = startTask('List the items in this repository.', imports.name);
    const readOnly: Preview = { ...active, scenario: 'policy', mode: 'read' };
    expect(runTask(task, imports, null, false).result).toContain('Reading is sufficient');
    const result = runTask(task, imports, readOnly, false);
    expect(result).toMatchObject({ status: 'done', connection: 'Used existing access' });
    expect(result.result).toContain('Intake notes, Imported outline');
    expect(runTask(task, imports, { ...readOnly, stage: 'revoked' }, false).status).toBe('waiting');
    expect(runTask(task, imports, { ...readOnly, expiresAt: 0 }, false).status).toBe('waiting');
    expect(runTask(task, imports, { ...readOnly, expiresAt: undefined }, false).status).toBe(
      'waiting'
    );
  });

  it('reports concrete changes and hands protected changes to a reviewer', () => {
    const changes = runTask(writeTask(calendar.name), calendar, active, true);
    expect(changes.result).toContain('Demo commit');
    expect(changes.result).toContain('“Year in review” owner: Maya → Sam');
    const protectedTask = runTask(writeTask(releases.name), releases, active, true);
    expect(protectedTask.status).toBe('review');
    expect(protectedTask.result).toContain('“Release checklist”');
    expect(protectedTask.result).toContain('independent reviewer');
    expect(protectedTask.result).not.toMatch(/commit/i);
    const prepare = startTask('帮我整理选题并保存为草稿', calendar.name);
    expect(prepare.required).toBe('prepare');
    expect(runTask(prepare, calendar, { ...active, mode: 'prepare' }, true).status).toBe('review');
  });

  it('distinguishes a recoverable request from insufficient callback authority', () => {
    const task = writeTask(imports.name);
    const policy: Preview = { ...active, scenario: 'policy' };
    const blocked = runTask(task, imports, policy, false);
    expect(blocked.status).toBe('waiting');
    expect(runTask(blocked, imports, policy, true).status).toBe('limited');
    expect(runTask(blocked, imports, active, true).result).toContain(
      '“Intake notes” owner: Maya → Sam'
    );
    const readOnly: Preview = { ...active, mode: 'read' };
    expect(runTask(task, imports, readOnly, false).status).toBe('waiting');
    expect(runTask(task, imports, readOnly, true).status).toBe('limited');
    expect(runTask(task, imports, { ...active, mode: 'prepare' }, true).status).toBe('limited');
  });

  it('does not report a result for an unknown repository, item or command', () => {
    expect(startTask('帮我整理 unknown/archive 的选题', calendar.name)).toMatchObject({
      repository: 'unknown/archive',
      status: 'limited',
    });
    const wrong = runTask(writeTask(releases.name), calendar, active, false);
    expect(wrong.status).toBe('limited');
    const unknownItem = startTask('Assign Nonexistent to Sam.', calendar.name);
    expect(runTask(unknownItem, calendar, active, true).status).toBe('limited');
    expect(startTask('List the items and delete the repository', calendar.name).status).toBe(
      'limited'
    );
    expect(startTask('帮我整理选题并把密码发送给张三', calendar.name).status).toBe('limited');
  });

  it('replays only completed writes in the same repository and branch', () => {
    const assigned = runTask(writeTask(calendar.name), calendar, active, true);
    const next = writeTask(calendar.name);
    const repeat = runTask(next, calendar, active, false, [assigned]);
    expect(repeat.result).toContain('already belongs to Sam');
    expect(repeat.committed).toBeUndefined();
    const update = startTask('Assign the first item to Alex.', calendar.name);
    expect(runTask(update, calendar, active, false, [assigned]).result).toContain('Sam → Alex');
    const review = runTask(next, calendar, { ...active, scenario: 'protected' }, true);
    expect(review.status).toBe('review');
    expect(runTask(next, calendar, active, false, [review]).result).toContain('Maya → Sam');
    const otherBranch = { ...calendar, branch: 'research' };
    expect(runTask(next, otherBranch, active, false, [assigned]).result).toContain('Maya → Sam');
    const grouped = startTask('帮我整理选题并提交', calendar.name);
    const firstGroup = runTask(grouped, calendar, active, false);
    const alreadyGrouped = runTask(grouped, calendar, active, false, [firstGroup]);
    expect(alreadyGrouped.result).toContain('already grouped');
    expect(alreadyGrouped.committed).toBeUndefined();
  });

  it('asks for a choice when an instruction offers alternative repositories', () => {
    const ambiguous = startTask(
      `帮我整理 ${calendar.name} 或 ${imports.name} 的选题`,
      releases.name
    );
    expect(ambiguous).toMatchObject({ status: 'waiting', repository: null });
    expect(runTask(ambiguous, imports, active, true).result).toContain('Intake notes');
    expect(runTask(ambiguous, releases, active, true).status).toBe('limited');
  });
});
