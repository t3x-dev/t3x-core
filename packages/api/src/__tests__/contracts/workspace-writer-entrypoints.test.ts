import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = (relative: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../../${relative}`, import.meta.url)), 'utf8');

describe('supported Workspace writer entry points', () => {
  it.each([
    ['Web', 'apps/web/src/hooks/workspaces/useWorkspaceAuthoring.ts'],
    ['CLI', 'apps/cli/src/commands/workspace.ts'],
    ['MCP/Codex', 'packages/mcp/src/tools/core/edit.ts'],
  ])('%s writes only through the shared API capability', (_surface, path) => {
    const text = source(path);
    expect(text).toContain('workspaces.authoring');
    expect(text).not.toContain('@t3x-dev/storage');
    expect(text).not.toContain('upsertWorkspaceDraft');
    expect(text).not.toContain('transactWorkspaceAuthoring');
  });

  it('keeps the evaluation runner non-writing until it adopts the guarded API capability', () => {
    for (const path of [
      'apps/runner/src/server.ts',
      'apps/runner/src/engine-client.ts',
      'apps/runner/src/index.ts',
    ]) {
      const text = source(path);
      expect(text).not.toContain('upsertWorkspaceDraft');
      expect(text).not.toContain('transactWorkspaceAuthoring');
      expect(text).not.toContain('/workspaces/');
    }
  });
});
