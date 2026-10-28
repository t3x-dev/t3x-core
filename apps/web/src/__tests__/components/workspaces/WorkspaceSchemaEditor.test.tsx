// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComposeFieldDialog } from '@/components/workspaces/ComposeFieldDialog';
import type { useComposeActivity } from '@/hooks/workspaces/useComposeActivity';
import type { WorkspaceCandidate } from '@/types/workspaces';

const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), preparation: vi.fn() }));
vi.mock('@/hooks/workspaces/useWorkspaceSchemaEditingRequests', () => {
  const requests = { read: mocks.read };
  return { useWorkspaceSchemaEditingRequests: () => requests };
});
vi.mock('@/hooks/schemas/useStudioSchemaEditCandidate', () => ({
  useStudioSchemaEditCandidate: () => ({ save: mocks.save, pending: false }),
}));
vi.mock('@/components/schemas/SchemaContentPreparationDialog', () => ({
  SchemaContentPreparationDialog: (props: unknown) => {
    mocks.preparation(props);
    return <div>Prepare existing Schema candidate</div>;
  },
}));

const definition = {
  yschema: '0.1',
  name: 'rollout',
  nodes: { rollout: { slots: { allocation: { type: 'number' } } } },
};
const candidate = {
  id: 'w',
  projectId: 'p',
  revision: 4,
  schemaBindings: [{ schemaHash: 'bound' }],
} as WorkspaceCandidate;
const baseSession = () => ({
  workspace: candidate,
  edit: null,
  unapplied: false,
  candidateIds: [],
  preview: {
    schema: definition,
    schemaHash: 'bound',
    reviewHash: 'review',
    workspace: { revision: 4 },
    origins: {},
    sources: [],
  },
});

function setup(
  initialSubject: 'content' | 'schema' = 'schema',
  onChanged = vi.fn().mockResolvedValue(undefined)
) {
  const publish = vi.fn();
  const onClose = vi.fn();
  render(
    <ComposeFieldDialog
      candidate={candidate}
      activity={
        {
          compositionRevision: 4,
          publish,
          view: { current: { rollout: { allocation: 20 } } },
        } as unknown as ReturnType<typeof useComposeActivity>
      }
      initialView="structure"
      initialSubject={initialSubject}
      title="Release"
      onClose={onClose}
      onDiscuss={vi.fn()}
      onSchemaChanged={onChanged}
    />
  );
  return { publish, onClose, onChanged };
}

describe('Workspace Content and Schema editing boundaries', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.read.mockResolvedValue(baseSession());
    mocks.save.mockResolvedValue({ candidate: {} });
  });

  it('retains both inputs across switches and never saves or applies merely by switching', async () => {
    const { publish } = setup('content');
    fireEvent.click(screen.getByRole('button', { name: 'Edit allocation' }));
    fireEvent.change(screen.getByLabelText('New value'), { target: { value: '35' } });
    fireEvent.click(screen.getByRole('button', { name: 'Schema', exact: true }));
    const type = await screen.findByLabelText('Type rollout/allocation');
    fireEvent.change(type, { target: { value: 'string' } });
    expect(screen.getByRole('button', { name: 'Save edits' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Content · Unsaved', exact: true }));
    expect(screen.getByLabelText('New value')).toHaveValue(35);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: /Schema · Unsaved/ }));
    expect(screen.getByLabelText('Type rollout/allocation')).toHaveValue('string');
    expect(screen.getByRole('button', { name: 'Save edits' })).toBeEnabled();
    expect(publish).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.preparation).not.toHaveBeenCalled();
  });

  it('saves a candidate separately and prepares only the freshly read exact candidate', async () => {
    setup();
    fireEvent.change(await screen.findByLabelText('Type rollout/allocation'), {
      target: { value: 'string' },
    });
    const saved = {
      ...baseSession(),
      unapplied: true,
      edit: {
        candidateId: 'edit',
        revision: 3,
        baseDefinition: definition,
        authoringDraft: { base: { schemaHash: 'bound' } },
      },
      preview: {
        ...baseSession().preview,
        schema: {
          ...definition,
          nodes: { rollout: { slots: { allocation: { type: 'string' } } } },
        },
        schemaHash: 'changed',
        reviewHash: 'review-saved',
      },
    };
    mocks.save.mockImplementationOnce(async () => {
      mocks.read.mockResolvedValue(saved);
      return { candidate: saved.edit };
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save edits' }));
    await screen.findByText(/Saved Schema candidate · not applied/);
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'w',
        ifRevision: 0,
        baseSchemaHash: 'bound',
        candidateIds: [],
      })
    );
    expect(mocks.preparation).not.toHaveBeenCalled();
    mocks.read.mockResolvedValue({
      ...saved,
      edit: { ...saved.edit, revision: 4 },
      preview: { ...saved.preview, reviewHash: 'latest-review' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Prepare and save to Draft' }));
    await screen.findByText('Prepare existing Schema candidate');
    expect(mocks.preparation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        revision: 4,
        target: {
          kind: 'studio',
          candidateIds: [],
          reviewHash: 'latest-review',
          schemaEditCandidate: { candidateId: 'edit', revision: 4 },
        },
      })
    );
  });

  it('retains local Schema input and refuses a save after content changes remotely', async () => {
    setup();
    fireEvent.change(await screen.findByLabelText('Type rollout/allocation'), {
      target: { value: 'string' },
    });
    mocks.read.mockResolvedValue({ ...baseSession(), workspace: { ...candidate, revision: 5 } });
    fireEvent.click(screen.getByRole('button', { name: 'Save edits' }));
    await screen.findByText(/Schema or content changed/);
    expect(screen.getByLabelText('Type rollout/allocation')).toHaveValue('string');
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('keeps the dialog open while a Schema save is in flight', async () => {
    const { onClose } = setup();
    fireEvent.change(await screen.findByLabelText('Type rollout/allocation'), {
      target: { value: 'string' },
    });
    let complete!: (value: ReturnType<typeof baseSession>) => void;
    mocks.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save edits' }));
    expect(screen.queryByRole('button', { name: 'Close', exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Content', exact: true })).toBeDisabled();
    await act(async () => complete(baseSession()));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Close', exact: true })).toBeEnabled()
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not report a completed candidate write as failed when the parent refresh fails', async () => {
    setup('schema', vi.fn().mockRejectedValue(new Error('network')));
    fireEvent.change(await screen.findByLabelText('Type rollout/allocation'), {
      target: { value: 'string' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save edits' }));
    await screen.findByText(
      'Schema candidate was saved. Refresh the Workspace to load its latest state.'
    );
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Schema', exact: true })).toBeVisible();
  });
});
