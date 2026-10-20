// @vitest-environment jsdom
import '@testing-library/jest-dom';
import type { AssistantSchemaSettingsView } from '@t3x-dev/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    expect(screen.getByText(/Owner is required/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Save Schema to Draft' })).not.toBeInTheDocument();
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
