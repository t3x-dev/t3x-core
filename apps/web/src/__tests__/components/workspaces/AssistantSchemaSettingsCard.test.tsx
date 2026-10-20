// @vitest-environment jsdom
import '@testing-library/jest-dom';
import type { AssistantSchemaSettingsView } from '@t3x-dev/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsForm } from '@/components/workspaces/AssistantSchemaSettingsCard';

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
  it('confirms the exact user settings and preserves advanced attributes', async () => {
    const save = vi.fn(async () => {});
    render(<SettingsForm record={record} disabled={false} onSave={save} onResume={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: 'Slot name advantage' })).toHaveValue('advantage');
    expect(screen.getByRole('combobox', { name: /provenanceRequired/ })).toHaveValue('true');
    fireEvent.change(screen.getByRole('combobox', { name: 'Slot type advantage' }), {
      target: { value: 'number' },
    });
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'required for slot requirements/advantage' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & generate candidate' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Continue generating candidate' }));
    expect(resume).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });
});
