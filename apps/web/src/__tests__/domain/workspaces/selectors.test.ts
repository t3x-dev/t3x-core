import { describe, expect, it } from 'vitest';
import {
  formatWorkspaceStatus,
  getPrimarySchemaBinding,
  summarizeSourceBundle,
} from '@/domain/workspaces/selectors';
import type { SourceBundleItem } from '@/types/workspaces';

describe('workspace selectors', () => {
  it('formats workspace status labels for project-first candidate states', () => {
    expect(formatWorkspaceStatus('draft')).toBe('Draft');
    expect(formatWorkspaceStatus('ready_for_yops')).toBe('Ready for YOps');
    expect(formatWorkspaceStatus('schema_review')).toBe('Schema review');
    expect(formatWorkspaceStatus('committed')).toBe('Committed');
  });

  it('summarizes mixed source bundles without privileging chat', () => {
    const sources: SourceBundleItem[] = [
      { id: 'src_chat', type: 'chat', title: 'Audience chat', conversationId: 'conv_1' },
      { id: 'src_doc', type: 'document', title: 'PRD import', fileName: 'prd.md' },
      { id: 'src_prompt', type: 'prompt_run', title: 'Prompt audit', runId: 'run_1' },
      { id: 'src_import', type: 'import', title: 'YAML seed', format: 'yaml' },
    ];

    expect(summarizeSourceBundle(sources)).toBe('1 chat, 1 doc, 1 prompt run, 1 import');
  });

  it('returns an empty source summary for candidates without source evidence yet', () => {
    expect(summarizeSourceBundle([])).toBe('No sources');
  });

  it('prefers pinned and draft override schema bindings over project defaults', () => {
    expect(
      getPrimarySchemaBinding([
        { schemaName: 'PRD Schema', version: 'v2', mode: 'project_default' },
        { schemaName: 'PRD Schema', version: 'v3', mode: 'pinned' },
      ])
    ).toEqual({ schemaName: 'PRD Schema', version: 'v3', mode: 'pinned' });

    expect(
      getPrimarySchemaBinding([
        { schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' },
        { schemaName: 'PRD Schema', version: 'v4 draft', mode: 'draft_override' },
      ])
    ).toEqual({ schemaName: 'PRD Schema', version: 'v4 draft', mode: 'draft_override' });
  });
});
