// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SchemaContentPreparationDialog } from '@/components/schemas/SchemaContentPreparationDialog';
import {
  newPreparationChange,
  type PreparationChange,
  PreparationValueTree,
  preparationCommands,
} from '@/components/schemas/SchemaPreparationFields';

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  apply: vi.fn(),
  prepared: vi.fn(),
  close: vi.fn(),
}));
vi.mock('@/infrastructure/schemaStudio', () => ({
  previewSchemaContentPreparation: mocks.preview,
  applySchemaContentPreparation: mocks.apply,
}));
const hash = `sha256:${'a'.repeat(64)}`;
const target = { kind: 'pending' as const, pendingId: hash };
const command = [{ kind: 'move', from: 'candidate/requirements', to: 'candidate/features' }];
const preview = (ready = false) => ({
  previewHash: hash,
  workspaceRevision: 3,
  schemaHash: hash,
  compositionRevision: 2,
  refHead: null,
  rootKey: 'candidate',
  schema: { nodes: {} },
  before: { candidate: { requirements: { title: 'Edited content' } } },
  after: { candidate: { features: { title: 'Edited content' } } },
  operations: [{ assert: { path: 'candidate' } }],
  impact: { items: [{ kind: 'needs_mapping', path: 'nodes.requirements' }] },
  valid: true,
  ready,
  canPrepare: ready,
  issues: ready
    ? []
    : [{ code: 'MAPPING_REQUIRED', path: 'nodes.requirements', message: 'Map existing content' }],
});
const props = {
  projectId: 'p',
  workspaceId: 'w',
  revision: 3,
  target,
  open: true,
  onOpenChange: mocks.close,
  onPrepared: mocks.prepared,
};
async function addMove() {
  await waitFor(() => expect(screen.getByRole('button', { name: '+ Add change' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '+ Add change' }));
  fireEvent.change(screen.getByLabelText('Action for change 1'), { target: { value: 'move' } });
  fireEvent.change(screen.getByLabelText('Content path for change 1'), {
    target: { value: command[0].from },
  });
  fireEvent.change(screen.getByLabelText('Destination for change 1'), {
    target: { value: command[0].to },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.preview.mockImplementation(async (_p, _w, input) => preview(input.commands.length > 0));
  mocks.apply.mockResolvedValue({ outcome: 'prepared' });
});
it('previews explicit mappings and invalidates approval as soon as the input changes', async () => {
  render(<SchemaContentPreparationDialog {...props} />);
  await addMove();
  expect(screen.getByRole('button', { name: 'Save prepared Draft' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: /My changes explicitly handle/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview migration' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save prepared Draft' })).toBeEnabled()
  );
  expect(mocks.preview).toHaveBeenLastCalledWith('p', 'w', {
    target,
    ifRevision: 3,
    commands: command,
    confirmedChanges: ['nodes.requirements'],
  });
  fireEvent.click(screen.getByRole('button', { name: 'Remove change 1' }));
  expect(screen.getByRole('button', { name: 'Save prepared Draft' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(mocks.apply).not.toHaveBeenCalled();
  expect(mocks.close).toHaveBeenCalledWith(false);
});
it('retries a lost response with the same request identity and saves through the atomic endpoint only', async () => {
  render(<SchemaContentPreparationDialog {...props} />);
  await addMove();
  fireEvent.click(screen.getByRole('checkbox', { name: /My changes explicitly handle/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview migration' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save prepared Draft' })).toBeEnabled()
  );
  mocks.apply.mockRejectedValueOnce(new Error('Connection lost'));
  fireEvent.click(screen.getByRole('button', { name: 'Save prepared Draft' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Connection lost'));
  fireEvent.click(screen.getByRole('button', { name: 'Save prepared Draft' }));
  await waitFor(() => expect(mocks.prepared).toHaveBeenCalledTimes(1));
  expect(mocks.apply.mock.calls[0]).toEqual(mocks.apply.mock.calls[1]);
  expect(mocks.apply.mock.calls[0]).toMatchObject([
    'p',
    'w',
    {
      target,
      commands: command,
      confirmedChanges: ['nodes.requirements'],
      ifRevision: 3,
      previewHash: hash,
    },
  ]);
});
it('discards delayed responses from another Workspace revision and invalidates approval on focus', async () => {
  let finishOld!: (value: unknown) => void;
  mocks.preview.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOld = resolve;
      })
  );
  const { rerender } = render(<SchemaContentPreparationDialog {...props} />);
  rerender(<SchemaContentPreparationDialog {...props} revision={4} />);
  await waitFor(() => expect(screen.getByRole('button', { name: '+ Add change' })).toBeEnabled());
  await act(async () => finishOld({ ...preview(), before: { wrong: 'old' } }));
  expect(screen.queryByText(/wrong/)).not.toBeInTheDocument();
  act(() => window.dispatchEvent(new Event('focus')));
  expect(screen.getByRole('button', { name: 'Save prepared Draft' })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('Preview the migration again');
});

it('shows unchanged content and readable trees instead of source, and previews schema-only changes explicitly', async () => {
  const data = preview(true);
  data.after = data.before as typeof data.after;
  data.schema = {
    nodes: { product: { slots: { title: { type: 'string', gapQuestion: 'What title?' } } } },
  } as typeof data.schema;
  mocks.preview.mockResolvedValue(data);
  render(<SchemaContentPreparationDialog {...props} />);
  await screen.findByText(/Content is unchanged/);
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(document.querySelector('pre')).toBeNull();
  expect(screen.queryByText(/JSON/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save prepared Draft' })).toBeDisabled();
  fireEvent.click(screen.getByText('Browse complete content · before and after'));
  expect(screen.getByRole('region', { name: 'Current Draft' })).toHaveTextContent('Edited content');
  expect(screen.getByRole('region', { name: 'Prepared Draft' })).toHaveTextContent(
    'Edited content'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Preview migration' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save prepared Draft' })).toBeEnabled()
  );
  expect(mocks.preview).toHaveBeenLastCalledWith('p', 'w', {
    target,
    ifRevision: 3,
    commands: [],
    confirmedChanges: [],
  });
});

it('uses typed inputs for object values and preserves numbers, booleans, empty text and explicit empty values', async () => {
  render(<SchemaContentPreparationDialog {...props} />);
  await waitFor(() => expect(screen.getByRole('button', { name: '+ Add change' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '+ Add change' }));
  fireEvent.change(screen.getByLabelText('Content path for change 1'), {
    target: { value: 'candidate/product' },
  });
  fireEvent.change(screen.getByLabelText('Type of Value for change 1'), {
    target: { value: 'object' },
  });
  const types = ['number', 'boolean', 'text', 'null'];
  for (let index = 0; index < types.length; index++) {
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    fireEvent.change(screen.getByLabelText(`Field name ${index + 1} of Value for change 1`), {
      target: { value: ['count', 'enabled', 'title', 'note'][index] },
    });
    fireEvent.change(screen.getByLabelText(`Type of Value for change 1, item ${index + 1}`), {
      target: { value: types[index] },
    });
  }
  fireEvent.change(screen.getByLabelText('Value for change 1, item 1'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview migration' }));
  await waitFor(() =>
    expect(mocks.preview).toHaveBeenLastCalledWith(
      'p',
      'w',
      expect.objectContaining({
        commands: [
          {
            kind: 'set',
            path: 'candidate/product',
            value: { count: 0, enabled: false, title: '', note: null },
          },
        ],
      })
    )
  );
});

it('validates incomplete form values locally with a human-readable error', async () => {
  render(<SchemaContentPreparationDialog {...props} />);
  await waitFor(() => expect(screen.getByRole('button', { name: '+ Add change' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '+ Add change' }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview migration' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Change 1: choose a content path.');
  expect(mocks.preview).toHaveBeenCalledTimes(1);
  expect(mocks.apply).not.toHaveBeenCalled();
});

it('discards a delayed preview when a form field changes and requires a fresh confirmation', async () => {
  render(<SchemaContentPreparationDialog {...props} />);
  await addMove();
  let finish!: (value: unknown) => void;
  mocks.preview.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Preview migration' }));
  act(() => window.dispatchEvent(new Event('focus')));
  fireEvent.change(screen.getByLabelText('Destination for change 1'), {
    target: { value: 'candidate/other' },
  });
  await act(async () => finish(preview(true)));
  expect(screen.getByRole('button', { name: 'Save prepared Draft' })).toBeDisabled();
  expect(screen.getByText(/results below belong to the previous preview/)).toBeInTheDocument();
});

it.each([
  'move',
  'rename_node',
  'remove',
  'set',
  'append',
] as const)('compiles %s through the existing migration contract', (kind) => {
  const change: PreparationChange = {
    ...newPreparationChange(),
    kind,
    path: 'candidate/product',
    destination: kind === 'rename_node' ? 'overview' : 'candidate/overview',
  };
  expect(preparationCommands([change])).toEqual([
    kind === 'move'
      ? { kind, from: change.path, to: change.destination }
      : kind === 'rename_node'
        ? { kind, path: change.path, toKey: 'overview' }
        : kind === 'remove'
          ? { kind, path: change.path }
          : { kind, path: change.path, value: '' },
  ]);
});

it('preserves nested list values and rejects duplicate object fields or blank numbers', () => {
  const change = { ...newPreparationChange(), path: 'candidate/items' };
  change.value = {
    type: 'array',
    text: '',
    children: [
      { id: 'one', name: '', value: { type: 'number', text: '0', children: [] } },
      { id: 'two', name: '', value: { type: 'array', text: '', children: [] } },
    ],
  };
  expect(preparationCommands([change])).toEqual([
    { kind: 'set', path: change.path, value: [0, []] },
  ]);
  change.value.type = 'object';
  change.value.children.forEach((child) => {
    child.name = 'duplicate';
  });
  expect(() => preparationCommands([change])).toThrow('field names must be unique');
  change.value = { type: 'number', text: '', children: [] };
  expect(() => preparationCommands([change])).toThrow('enter a valid number');
});

it('shows semantic Nodes and Slots directly without a children or slots wrapper', () => {
  render(
    <PreparationValueTree
      value={{
        key: 'candidate',
        slots: {},
        children: [
          { key: 'product', slots: { title: 'A title', enabled: false, count: 0 }, children: [] },
          {
            key: 'requirements',
            slots: {},
            children: [{ key: 'learning_plan', slots: { title: 'Plan' }, children: [] }],
          },
        ],
      }}
    />
  );
  expect(screen.getByLabelText('Node candidate')).toBeInTheDocument();
  expect(screen.getByLabelText('Node product')).toHaveTextContent('3 Slots · 0 Nodes');
  expect(screen.getByLabelText('Node requirements')).toHaveTextContent('0 Slots · 1 Node');
  expect(screen.getByLabelText('Node learning_plan')).toBeInTheDocument();
  expect(screen.getAllByText('Slot title', { selector: 'span' })).toHaveLength(2);
  expect(screen.getByText('false')).toBeInTheDocument();
  expect(screen.getByText('0')).toBeInTheDocument();
  expect(screen.queryByText('children')).not.toBeInTheDocument();
  expect(screen.queryByText('slots')).not.toBeInTheDocument();
});

it('keeps actual business Slots named children distinct from the hidden transport wrapper', () => {
  render(
    <PreparationValueTree
      value={{ key: 'product', slots: { children: 'A real field' }, children: [] }}
    />
  );
  expect(screen.getByText('Slot children')).toBeInTheDocument();
  expect(screen.getByText('A real field')).toBeInTheDocument();
});
