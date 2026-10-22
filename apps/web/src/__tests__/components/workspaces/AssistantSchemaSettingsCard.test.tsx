// @vitest-environment jsdom
import '@testing-library/jest-dom';
import type { AssistantSchemaSettingsView } from '@t3x-dev/api-client';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AssistantSchemaSettingsCard,
  AssistantSchemaSettingsDetails,
  AssistantSchemaSettingsTimeline,
  SettingsForm,
} from '@/components/workspaces/AssistantSchemaSettingsCard';

const hook = vi.hoisted(() => ({
  record: null as AssistantSchemaSettingsView | null,
  generate: vi.fn(),
  save: vi.fn(),
  error: undefined as string | undefined,
  generating: false,
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

it('shows three independent timeline cards and unlocks sibling Slots after their parent Confirm', () => {
  const node = {
    ...record,
    settingsId: 'owner',
    settings: {
      action: 'add_node' as const,
      nodePath: 'product',
      name: 'owner',
      definition: {},
      intent: 'Add product owner',
    },
  };
  const name = {
    ...record,
    settingsId: 'name',
    status: 'queued' as const,
    settings: { ...record.settings, nodePath: 'product/owner', name: 'name' },
  };
  const phone = { ...name, settingsId: 'phone', settings: { ...name.settings, name: 'phone' } };
  const generate = vi.fn();
  const state = { ...hook, record: { ...node, cards: [node, name, phone] }, generate };
  const { rerender } = render(
    <AssistantSchemaSettingsTimeline projectId="p" workspaceId="w" disabled={false} state={state} />
  );
  const cards = screen.getAllByRole('region', { name: 'Schema change candidate' });
  expect(cards).toHaveLength(3);
  expect(within(cards[0]!).getByRole('heading')).toHaveTextContent('Add Node · owner');
  expect(within(cards[0]!).getByRole('button', { name: 'Confirm', exact: true })).toBeEnabled();
  expect(within(cards[1]!).getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled();
  expect(within(cards[2]!).getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled();
  const applied = { ...node, status: 'applied' as const };
  rerender(
    <AssistantSchemaSettingsTimeline
      projectId="p"
      workspaceId="w"
      disabled={false}
      state={{ ...state, record: { ...applied, cards: [applied, name, phone] } }}
    />
  );
  const waiting = screen.getAllByRole('region', { name: 'Schema change candidate' });
  expect(within(waiting[0]!).getByRole('button', { name: 'Confirm', exact: true })).toBeEnabled();
  expect(within(waiting[1]!).getByRole('button', { name: 'Confirm', exact: true })).toBeEnabled();
  expect(
    within(waiting[1]!).getByRole('button', { name: 'Edit attributes', exact: true })
  ).toBeEnabled();
  fireEvent.click(within(waiting[1]!).getByRole('button', { name: 'Confirm', exact: true }));
  expect(generate).toHaveBeenCalledWith(phone.settings, undefined, phone);
});
describe('Assistant settings reuse the Studio property controls', () => {
  it.each([
    ['add_relation', 'Relation type'],
    ['edit_relation', 'Relation type'],
    ['remove_relation', 'Relation type'],
    ['add_rule', 'Rule'],
    ['edit_rule', 'Rule'],
    ['remove_rule', 'Rule'],
  ] as const)('labels the proposed %s definition by its actual kind', (action, kind) => {
    render(
      <SettingsForm
        record={{
          ...record,
          settings: { ...record.settings, action, nodePath: '', definition: {} },
        }}
        disabled={false}
        onSave={vi.fn()}
        onResume={vi.fn()}
      />
    );
    const proposed = screen.getByText('Proposed definition').parentElement!;
    expect(within(proposed).getByText(kind, { exact: true })).toBeVisible();
    expect(within(proposed).queryByText('Node', { exact: true })).not.toBeInTheDocument();
  });
  it('uses matching compact buttons for Schema discussion and Studio navigation', () => {
    const discuss = vi.fn();
    render(
      <AssistantSchemaSettingsDetails
        record={{ ...record, status: 'applied' }}
        projectId="p"
        workspaceId="workspace_branch:dev"
        onDiscuss={discuss}
      />
    );
    const actions = screen.getByRole('group', { name: 'Schema change actions' });
    expect(actions.tagName).toBe('FIELDSET');
    const ask = within(actions).getByRole('button', { name: 'Ask AI' });
    const studio = within(actions).getByRole('link', { name: 'Open Schema Studio' });
    for (const control of [ask, studio]) {
      expect(control).toHaveAttribute('data-slot', 'button');
      expect(control).toHaveAttribute('data-variant', 'canvas-outline');
      expect(control).toHaveAttribute('data-size', 'sm');
      expect(control.querySelector('svg')).toBeInTheDocument();
    }
    expect(studio).toHaveAttribute(
      'href',
      '/project/p?tab=schemas&schemaView=studio&workspace=workspace_branch%3Adev'
    );
    fireEvent.click(ask);
    expect(discuss).toHaveBeenCalledOnce();
  });

  it.each([
    ['remove_slot', {}, undefined],
    [
      'move_slot',
      { targetNodePath: 'product/owner', newName: 'benefit', definition: { type: 'number' } },
      'product/owner/benefit',
    ],
  ] as const)('inspects %s as a Schema change, not a content mutation', (action, overrides, newPath) => {
    const onDiscuss = vi.fn();
    render(
      <AssistantSchemaSettingsDetails
        record={{
          ...record,
          status: 'applied',
          currentDefinition: { type: 'string', maxWords: 24 },
          settings: { ...record.settings, action, definition: {}, ...overrides },
        }}
        projectId="p"
        workspaceId="dev"
        onDiscuss={onDiscuss}
      />
    );
    const value = screen.getByRole('region', { name: 'Definition after selected change' });
    if (action === 'remove_slot') {
      expect(value).toHaveTextContent('Absent');
      expect(screen.getByText('Object removed')).toBeVisible();
    } else {
      expect(value).toHaveTextContent('string');
      expect(value).not.toHaveTextContent('number');
      const path = screen.getByRole('region', { name: 'Field change: path' });
      expect(within(path).getByText('requirements/advantage')).toBeVisible();
      expect(within(path).getByText(newPath!)).toBeVisible();
    }
    expect(screen.queryByRole('button', { name: 'Edit', exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Schema Studio' })).toHaveAttribute(
      'href',
      '/project/p?tab=schemas&schemaView=studio&workspace=dev'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
    expect(onDiscuss).toHaveBeenCalledOnce();
  });

  it('does not present an un-applied candidate as the current Schema or invent an unavailable base', () => {
    render(
      <AssistantSchemaSettingsDetails
        record={{
          ...record,
          status: 'generated',
          settings: {
            ...record.settings,
            action: 'edit_slot',
            definitionMode: 'replace',
            definition: { type: 'string', maxWords: 0 },
          },
        }}
        projectId="p"
        workspaceId="dev"
        onDiscuss={vi.fn()}
      />
    );
    expect(screen.getByText('Candidate · Not applied')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Proposed Schema definition' })).toHaveTextContent(
      '0'
    );
    expect(screen.getByText('The definition before this change is unavailable.')).toBeVisible();
    expect(screen.queryByText('Object added')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Current Draft value' })).not.toBeInTheDocument();
  });

  it('keeps the applied card to a title row, inline summary and shared details/link row', () => {
    hook.record = { ...record, status: 'applied' };
    render(
      <AssistantSchemaSettingsCard projectId="p" workspaceId="w" refreshKey="1" disabled={false} />
    );
    const card = screen.getByRole('region', { name: 'Schema saved to Draft' });
    const header = card.querySelector('header')!;
    expect(within(header).getByRole('heading', { name: 'Advantage' })).toBeVisible();
    expect(within(header).getByText('Saved to Draft')).toBeVisible();
    const details = screen.getByText('Technical details').closest('details')!;
    expect(
      within(details.parentElement!).getByRole('link', { name: 'Open Schema Studio' })
    ).toBeVisible();
    expect(within(details).getByText(/YAML content is unchanged/)).not.toBeVisible();
    fireEvent.click(screen.getByText('Technical details'));
    expect(within(details).getByText(/YAML content is unchanged/)).toBeVisible();
    expect(within(details).getByText('Added field in Requirements')).toBeVisible();
  });

  it('shows the applied Node path and effective attributes without opening technical details', () => {
    hook.record = {
      ...record,
      status: 'applied',
      settings: {
        action: 'add_node',
        nodePath: 'product',
        name: 'owner',
        definition: { required: false, repeated: false },
        intent: 'Add owner',
      },
    };
    render(
      <AssistantSchemaSettingsCard projectId="p" workspaceId="w" refreshKey="1" disabled={false} />
    );
    expect(screen.getByText('product/owner')).toBeVisible();
    const summary = screen.getByRole('list', { name: 'Schema change summary' });
    expect(within(summary).getByText('Node')).toBeVisible();
    for (const key of ['required', 'repeated']) {
      expect(
        within(within(summary).getByText(key).closest('li')!).getByText('false')
      ).toBeVisible();
    }
  });

  it('shows the actual edited constraint before and after, including explicit false and zero', () => {
    hook.record = {
      ...record,
      status: 'applied',
      currentDefinition: { type: 'string', maxWords: 24, minLength: 1 },
      settings: {
        ...record.settings,
        action: 'edit_slot',
        required: false,
        definition: { type: 'string', maxWords: 50, minLength: 0 },
      },
    };
    render(
      <AssistantSchemaSettingsCard projectId="p" workspaceId="w" refreshKey="1" disabled={false} />
    );
    const summary = screen.getByRole('list', { name: 'Schema change summary' });
    const words = within(summary).getByText('maxWords').closest('li')!;
    expect(within(words).getByText('24')).toBeVisible();
    expect(within(words).getByText('50')).toBeVisible();
    fireEvent.click(screen.getByText('Technical details'));
    const attributes = screen.getByRole('list', { name: 'Confirmed attributes' });
    expect(
      within(within(attributes).getByText('minLength').closest('li')!).getByText('0')
    ).toBeVisible();
    expect(
      within(within(summary).getByText('required').closest('li')!).getByText('false')
    ).toBeVisible();
  });

  it('shows a removed definition instead of presenting its old attributes as still applied', () => {
    hook.record = {
      ...record,
      status: 'applied',
      currentDefinition: { type: 'string', maxWords: 24 },
      settings: { ...record.settings, action: 'remove_slot', definition: {} },
    };
    render(
      <AssistantSchemaSettingsCard projectId="p" workspaceId="w" refreshKey="1" disabled={false} />
    );
    const summary = screen.getByRole('list', { name: 'Schema change summary' });
    expect(within(summary).getByText('Removed')).toBeVisible();
    expect(within(summary).queryByText('maxWords')).not.toBeInTheDocument();
  });

  it('shows the old and new paths after moving and renaming a field', () => {
    hook.record = {
      ...record,
      status: 'applied',
      currentDefinition: { type: 'string' },
      settings: {
        ...record.settings,
        action: 'move_slot',
        nodePath: 'product',
        name: 'phone',
        targetNodePath: 'product/owner',
        newName: 'owner_phone',
        definition: {},
      },
    };
    render(
      <AssistantSchemaSettingsCard projectId="p" workspaceId="w" refreshKey="1" disabled={false} />
    );
    expect(screen.getByRole('heading', { name: 'Owner phone' })).toBeVisible();
    const row = within(screen.getByRole('list', { name: 'Schema change summary' }))
      .getByText('path')
      .closest('li')!;
    expect(within(row).getByText('product/phone')).toBeVisible();
    expect(within(row).getByText('product/owner/owner_phone')).toBeVisible();
  });

  it('shows a constraint removed by full replacement instead of silently omitting it', () => {
    hook.record = {
      ...record,
      status: 'applied',
      currentDefinition: { type: 'string', maxWords: 24 },
      settings: {
        ...record.settings,
        action: 'edit_slot',
        definitionMode: 'replace',
        definition: { type: 'string' },
      },
    };
    render(
      <AssistantSchemaSettingsCard projectId="p" workspaceId="w" refreshKey="1" disabled={false} />
    );
    const row = within(screen.getByRole('list', { name: 'Schema change summary' }))
      .getByText('maxWords')
      .closest('li')!;
    expect(within(row).getByText('24')).toBeVisible();
    expect(within(row).getByText('Not set')).toBeVisible();
  });

  it('shows and edits the effective required setting on a Node without a stale top-level override', async () => {
    const onSave = vi.fn(async () => {});
    const node = {
      ...record,
      settings: {
        action: 'edit_node',
        nodePath: '',
        name: 'experiments',
        required: true,
        definition: { required: false, slots: {} },
        intent: 'Require experiments',
      },
    } as AssistantSchemaSettingsView;
    render(<SettingsForm record={node} disabled={false} onSave={onSave} onResume={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit attributes' }));
    fireEvent.click(screen.getByText('Node settings'));
    expect(screen.getByRole('checkbox', { name: 'required for node experiments' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'required for node experiments' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          required: undefined,
          definition: expect.objectContaining({ required: false }),
        })
      )
    );
  });
  it('keeps the actual failure visible after the confirmed record is restored', () => {
    hook.record = { ...record, status: 'confirmed', revision: 2 };
    hook.error = 'Provider temporarily unavailable';
    render(
      <AssistantSchemaSettingsCard projectId="p" workspaceId="w" refreshKey="r2" disabled={false} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Provider temporarily unavailable');
    hook.error = undefined;
  });
  it('shows processing rather than Retry when a refreshed confirmed card is still running', () => {
    hook.record = { ...record, status: 'confirmed', revision: 2 };
    hook.generating = true;
    render(
      <AssistantSchemaSettingsCard projectId="p" workspaceId="w" refreshKey="r1" disabled={false} />
    );
    expect(screen.queryByRole('button', { name: 'Retry Confirm' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Applying…' })).toBeDisabled();
    expect(screen.queryByText(/previous attempt did not finish/)).not.toBeInTheDocument();
    hook.generating = false;
  });
  it('keeps the title and status in one header and secondary information collapsed beside the actions', () => {
    render(
      <SettingsForm
        record={
          {
            ...record,
            changes: [
              { kind: 'ADD', path: 'requirements/advantage', summary: 'Contract path added.' },
            ],
          } as AssistantSchemaSettingsView
        }
        disabled={false}
        onSave={vi.fn()}
        onResume={vi.fn()}
      />
    );
    const card = screen.getByRole('region', { name: 'Schema change candidate' });
    expect(within(card.querySelector('header')!).getByRole('heading')).toHaveTextContent(
      'Add Slot · advantage'
    );
    expect(
      within(card.querySelector('header')!).getByText('Candidate · Not applied')
    ).toBeVisible();
    expect(within(card).queryByText('advantage', { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText('Contract path added.')).not.toBeVisible();
    expect(screen.getByText('YAML content stays unchanged · No Commit')).not.toBeVisible();
    const footer = screen.getByRole('button', { name: 'Confirm' }).closest('footer')!;
    expect(within(footer).getByRole('button', { name: 'Edit attributes' })).toBeVisible();
    fireEvent.click(screen.getByText('Change details'));
    expect(screen.getByText('Contract path added.')).toBeVisible();
    expect(screen.getByText('YAML content stays unchanged · No Commit')).toBeVisible();
  });
  it('shows edited confirmation parameters instead of a stale server change summary', () => {
    const editing = {
      ...record,
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
  it('shows a deletion confirmation card and submits the exact change for confirmed application', async () => {
    const onSave = vi.fn(async () => {});
    const deletion = {
      ...record,
      settings: { ...record.settings, action: 'remove_slot', name: 'owner', definition: {} },
      currentDefinition: { type: 'string' },
    } as unknown as AssistantSchemaSettingsView;
    render(<SettingsForm record={deletion} disabled={false} onSave={onSave} onResume={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /Remove Slot.*owner/ })).toBeVisible();
    expect(
      screen.getByText(/Removes the definition only; existing YAML values are kept/)
    ).toBeVisible();
    fireEvent.click(screen.getByText('Change details'));
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
    await waitFor(() =>
      expect(hook.generate).toHaveBeenCalledWith(record.settings, undefined, hook.record)
    );
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
    expect(screen.getByText(/YAML content is unchanged/)).not.toBeVisible();
    expect(screen.getByText('1 required value to fill')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Content needs attention' }).parentElement).toBe(
      screen.getByText('Technical details').closest('details')!.parentElement
    );
    expect(screen.getByText(/Owner is required/)).not.toBeVisible();
    expect(
      screen.getByText('Schema saved to the current Draft and synced to Studio.')
    ).not.toBeVisible();
    fireEvent.click(screen.getByText('Technical details'));
    expect(
      screen.getByText('Schema saved to the current Draft and synced to Studio.')
    ).toBeVisible();
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
    expect(screen.getByText('Added field in Requirements')).not.toBeVisible();
    expect(
      within(
        within(screen.getByRole('list', { name: 'Schema change summary' }))
          .getByText('required')
          .closest('li')!
      ).getByText('true')
    ).toBeVisible();
    expect(screen.getByText('6 required values to fill')).toBeVisible();
    expect(screen.getByText(hash)).not.toBeVisible();
    expect(screen.getByText('Requirements / Learning plan')).not.toBeVisible();
    fireEvent.click(screen.getByLabelText('View affected items (6)'));
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
    fireEvent.click(screen.getByLabelText('View affected items (1)'));
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
    expect(screen.getByText('Add Node ·')).toBeVisible();
    expect(
      within(
        within(screen.getByRole('list', { name: 'Schema change summary' }))
          .getByText('repeated')
          .closest('li')!
      ).getByText('true')
    ).toBeVisible();
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
    expect(screen.queryByRole('button', { name: 'Save Schema to Draft' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit attributes' }));
    expect(screen.getByRole('textbox', { name: 'Slot name advantage' })).toHaveValue('advantage');
    expect(screen.getByRole('combobox', { name: /provenanceRequired/ })).toHaveValue('true');
    fireEvent.change(screen.getByRole('combobox', { name: 'Slot type advantage' }), {
      target: { value: 'number' },
    });
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'required for slot requirements/advantage' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Retry Confirm' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(screen.getByRole('dialog', { name: 'Replace the Studio candidate?' })).toBeVisible();
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep Studio candidate' }));
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace & apply to Draft' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(record.settings, true));
  });
});
