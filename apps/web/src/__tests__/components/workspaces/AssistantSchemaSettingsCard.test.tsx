// @vitest-environment jsdom
import '@testing-library/jest-dom';
import type { AssistantSchemaSettingsView } from '@t3x-dev/api-client';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AssistantSchemaSettingsCard,
  SettingsForm,
} from '@/components/workspaces/AssistantSchemaSettingsCard';

const hook = vi.hoisted(() => ({
  record: null as AssistantSchemaSettingsView | null,
  generate: vi.fn(),
  save: vi.fn(),
  error: undefined as string | undefined,
}));
vi.mock('@/hooks/schemas/useAssistantSchemaSettings', () => ({
  useAssistantSchemaSettings: () => hook,
}));

const record: AssistantSchemaSettingsView = {
  settingsId: 's',
  revision: 1,
  status: 'pending',
  conversationId: 'c',
  workspaceRevision: 2,
  schemaHash: 'hash',
  settings: {
    action: 'add_slot',
    nodePath: 'requirements',
    name: 'advantage',
    definition: {
      type: 'string',
      gapQuestion: 'Which advantage?',
      provenanceRequired: true,
      maxWords: 40,
    },
    required: false,
    intent: 'Add advantage',
  },
};
describe('Assistant settings reuse the Studio property controls', () => {
  it('shows edited confirmation parameters instead of a stale server change summary', () => {
    const editing = {
      ...record,
      generationMode: 'schema_yops_v1',
      changes: [{ kind: 'CHANGE', path: 'owner/maxWords', summary: 'Maximum words: 24 → 40' }],
    } as AssistantSchemaSettingsView;
    render(<SettingsForm record={editing} disabled={false} onSave={vi.fn()} onResume={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit attributes' }));
    fireEvent.change(screen.getByLabelText('maxWords for slot requirements/advantage'), {
      target: { value: '75' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit attributes' }));
    expect(screen.queryByText('Maximum words: 24 → 40')).not.toBeInTheDocument();
    expect(within(screen.getByLabelText('Parameters to confirm')).getByText('75')).toBeVisible();
  });
  it('edits only the confirmed rule and offers relationships from the exact Base', () => {
    const rule = {
      ...record,
      generationMode: 'schema_yops_v1',
      referenceRelations: {
        depends_on: { from: 'requirements/*', to: 'requirements/*' },
        blocks: { from: 'requirements/*', to: 'requirements/*' },
      },
      settings: {
        ...record.settings,
        action: 'edit_rule',
        nodePath: '',
        name: 'dependency',
        definition: {
          id: 'dependency',
          kind: 'required_relation',
          relationType: 'depends_on',
          from: 'requirements/*',
          to: 'requirements/*',
        },
      },
    } as unknown as AssistantSchemaSettingsView;
    render(<SettingsForm record={rule} disabled={false} onSave={vi.fn()} onResume={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit attributes' }));
    expect(screen.getByRole('textbox', { name: 'Rule id dependency' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'relationType for rule dependency' })).toHaveValue(
      'depends_on'
    );
    expect(screen.getByRole('option', { name: 'blocks' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add node' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add rule' })).not.toBeInTheDocument();
  });
  it('shows a deletion confirmation card, not an addition editor, and confirms without applying', async () => {
    const onSave = vi.fn(async () => {});
    const deletion = {
      ...record,
      settings: { ...record.settings, action: 'remove_slot', name: 'owner', definition: {} },
      currentDefinition: { type: 'string' },
    } as unknown as AssistantSchemaSettingsView;
    render(<SettingsForm record={deletion} disabled={false} onSave={onSave} onResume={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /Remove Slot.*owner/ })).toBeVisible();
    expect(screen.getByText(/YAML content.*unchanged/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Edit attributes' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(deletion.settings));
  });
  it('offers direct Draft saving for an already generated snapshot', async () => {
    hook.record = {
      ...record,
      status: 'generated',
      candidateRevision: 3,
      snapshot: {
        compositionId: 'snapshot',
        compositionRevision: 1,
        compositionHash: 'hash',
        schemaHash: 'result-hash',
      },
    };
    hook.generate.mockReset().mockResolvedValue({ ...hook.record, status: 'applied' });
    const changed = vi.fn();
    render(
      <AssistantSchemaSettingsCard
        projectId="p"
        workspaceId="w"
        conversationId="c"
        refreshKey="1"
        disabled={false}
        onChanged={changed}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Schema to Draft' }));
    await waitFor(() => expect(hook.generate).toHaveBeenCalledWith(record.settings));
    expect(changed).toHaveBeenCalledTimes(1);
  });
  it('shows a saved binding with outstanding content gaps instead of another confirmation', () => {
    hook.record = {
      ...record,
      status: 'applied',
      candidateRevision: 3,
      application: {
        workspaceRevision: 5,
        ready: false,
        issues: [
          {
            code: 'REQUIRED_SLOT_MISSING',
            path: 'requirements/owner',
            message: 'Owner is required.',
          },
        ],
      },
    };
    render(
      <AssistantSchemaSettingsCard
        projectId="p"
        workspaceId="w"
        conversationId="c"
        refreshKey="1"
        disabled={false}
      />
    );
    expect(screen.getByRole('region', { name: 'Schema saved to Draft' })).toBeVisible();
    expect(screen.getByText(/YAML content is unchanged/)).toBeVisible();
    expect(screen.getByText('1 required value to fill')).toBeVisible();
    expect(screen.getByText(/Owner is required/)).not.toBeVisible();
    expect(screen.queryByRole('button', { name: 'Save Schema to Draft' })).not.toBeInTheDocument();
  });
  it('summarizes repeated content gaps and discloses readable items separately from technical details', () => {
    const keys = [
      'content_recommendation',
      'learning_plan',
      'mistake_review',
      'practice_feedback',
      'progress_tracking',
      'qa_tutoring',
    ];
    const hash = `sha256:${'a'.repeat(64)}`;
    hook.record = {
      ...record,
      status: 'applied',
      candidateRevision: 16,
      settings: {
        ...record.settings,
        name: 'owner_phone',
        required: true,
        definition: { type: 'string' },
      },
      snapshot: {
        compositionId: 'snapshot',
        compositionRevision: 1,
        compositionHash: 'composition',
        schemaHash: hash,
      },
      application: {
        workspaceRevision: 5,
        ready: false,
        issues: keys.map((key) => ({
          code: 'REQUIRED_SLOT_MISSING',
          path: `requirements/${key}/owner_phone`,
          message: `requirements/${key}/owner_phone is required before commit.`,
        })),
      },
    };
    render(
      <AssistantSchemaSettingsCard projectId="p" workspaceId="w" refreshKey="1" disabled={false} />
    );
    expect(screen.getByRole('heading', { name: 'Owner phone' })).toBeVisible();
    expect(screen.getByText('Added field in Requirements')).toBeVisible();
    expect(screen.getByText('Required', { exact: true })).toBeVisible();
    expect(screen.getByText('6 required values to fill')).toBeVisible();
    expect(screen.getByText(hash)).not.toBeVisible();
    expect(screen.getByText('Requirements / Learning plan')).not.toBeVisible();
    fireEvent.click(screen.getByText('View affected items (6)'));
    for (const name of [
      'Content recommendation',
      'Learning plan',
      'Mistake review',
      'Practice feedback',
      'Progress tracking',
      'Qa tutoring',
    ]) {
      expect(screen.getByText(`Requirements / ${name}`)).toBeVisible();
    }
    expect(screen.getByText('requirements/learning_plan/owner_phone')).not.toBeVisible();
    fireEvent.click(screen.getByText('Technical details'));
    expect(screen.getByText(hash)).toBeVisible();
    expect(screen.getByText('r16')).toBeVisible();
    expect(screen.getByText('requirements/learning_plan/owner_phone')).toBeVisible();
    expect(screen.getByRole('list', { name: 'Validation details' }).children).toHaveLength(6);
    expect(screen.getByRole('link', { name: 'Open Schema Studio' })).toHaveAttribute(
      'href',
      '/project/p?tab=schemas&schemaView=studio&workspace=w'
    );
  });
  it('does not describe other validation failures as missing required values', () => {
    hook.record = {
      ...record,
      status: 'applied',
      application: {
        workspaceRevision: 5,
        ready: false,
        issues: [
          {
            code: 'SLOT_TYPE_MISMATCH',
            path: 'requirements/plan/owner',
            message: 'Expected a string.',
          },
        ],
      },
    };
    render(
      <AssistantSchemaSettingsCard projectId="p" workspaceId="w" refreshKey="1" disabled={false} />
    );
    expect(screen.getByRole('region', { name: 'Content needs attention' })).toBeVisible();
    expect(screen.queryByText(/required values? to fill/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('View affected items (1)'));
    expect(
      within(screen.getByRole('region', { name: 'Content needs attention' })).getByText(
        'Expected a string.'
      )
    ).toBeVisible();
  });
  it('keeps a generated Node distinct from an applied Draft and handles absent optional metadata', () => {
    hook.record = {
      ...record,
      status: 'generated',
      settings: {
        ...record.settings,
        action: 'add_node',
        nodePath: '',
        name: 'experiments',
        definition: { repeated: true },
        required: false,
      },
    };
    render(
      <AssistantSchemaSettingsCard projectId="p" workspaceId="w" refreshKey="1" disabled={false} />
    );
    expect(screen.getByText('Candidate saved')).toBeVisible();
    expect(screen.getByText('Added Node')).toBeVisible();
    expect(screen.getByText('Repeated')).toBeVisible();
    expect(screen.getByText(/has not been applied to the Draft/)).toBeVisible();
    expect(screen.queryByText('Saved to Draft')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Content needs attention' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Studio revision')).not.toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });
  it('confirms the exact user settings and preserves advanced attributes', async () => {
    const save = vi.fn(async () => {});
    render(<SettingsForm record={record} disabled={false} onSave={save} onResume={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit attributes' }));
    expect(screen.getByRole('textbox', { name: 'Slot name advantage' })).toHaveValue('advantage');
    expect(screen.getByRole('combobox', { name: /provenanceRequired/ })).toHaveValue('true');
    fireEvent.change(screen.getByRole('combobox', { name: 'Slot type advantage' }), {
      target: { value: 'number' },
    });
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'required for slot requirements/advantage' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Schema to Draft' }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        ...record.settings,
        definition: { ...record.settings.definition, type: 'number' },
        required: true,
      })
    );
  });
  it('cancels without generating a candidate and exposes failure without losing settings', async () => {
    const save = vi.fn(async () => {
      throw new Error('Schema changed. Refresh.');
    });
    render(<SettingsForm record={record} disabled={false} onSave={save} onResume={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit attributes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Schema changed'));
    expect(save).toHaveBeenCalledWith(null);
    expect(screen.getByRole('textbox', { name: 'Slot name advantage' })).toHaveValue('advantage');
  });
  it('supports Node settings and resuming a confirmed card after refresh', () => {
    const save = vi.fn(async () => {});
    const resume = vi.fn();
    const { rerender } = render(
      <SettingsForm
        record={{
          ...record,
          settings: {
            ...record.settings,
            action: 'add_node',
            nodePath: '',
            name: 'experiments',
            definition: { slots: {}, repeated: true },
          },
        }}
        disabled={false}
        onSave={save}
        onResume={resume}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit attributes' }));
    expect(screen.getByRole('textbox', { name: 'Node name experiments' })).toHaveValue(
      'experiments'
    );
    rerender(
      <SettingsForm
        key="confirmed"
        record={{ ...record, status: 'confirmed' }}
        disabled={false}
        onSave={save}
        onResume={resume}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Resume saving to Draft' }));
    expect(resume).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });
  it('asks before replacing Studio and keeps its candidate when the user declines', async () => {
    const save = vi.fn(async () => {});
    render(
      <SettingsForm
        record={{ ...record, studioConflict: { candidateId: 'studio', revision: 7 } }}
        disabled={false}
        onSave={save}
        onResume={vi.fn()}
      />
    );
    expect(screen.getByRole('region', { name: 'Schema change candidate' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save Schema to Draft' }));
    expect(screen.getByRole('dialog', { name: 'Replace the Studio candidate?' })).toBeVisible();
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep Studio candidate' }));
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save Schema to Draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace & save to Draft' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(record.settings, true));
  });
});
