// @vitest-environment jsdom
import '@testing-library/jest-dom';
import type { StudioCandidate } from '@t3x-dev/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SchemaFieldTree } from '@/components/schemas/SchemaFieldTree';
import { SchemaSourceManager } from '@/components/schemas/SchemaSourceManager';

function source(id: string, title: string) {
  const candidate: StudioCandidate = {
    id,
    projectId: 'project',
    studioId: 'main',
    createdAt: '',
    title,
    available: true,
    source: {
      projectId: 'project',
      canonicalName: `test/${id}`,
      version: '1.0.0',
      artifactVersionId: `${id}-v1`,
      hash: `sha256:${'a'.repeat(64)}`,
    },
    description: null,
    kind: 'schema',
    license: null,
    reason: null,
  };
  return { id, title, source: `test/${id}`, candidate };
}

const catalog = vi.hoisted(() => ({
  data: { items: [] as unknown[], has_more: false },
  error: undefined as string | undefined,
  loading: false,
}));
vi.mock('@/hooks/schemas/useSchemaCatalog', () => ({
  useSchemaCatalog: () => ({ ...catalog, retry: vi.fn() }),
}));
beforeEach(() => {
  catalog.error = undefined;
  catalog.data.items = [];
});
function managerProps() {
  return {
    open: true,
    onOpenChange: vi.fn(),
    projectId: 'project',
    selection: [] as string[],
    modules: [source('tasks', 'Tasks'), source('people', 'People')],
    onRemove: vi.fn(),
    removalBlockers: {},
    pending: false,
    loading: false,
    onCombine: vi.fn(),
    onImport: vi.fn().mockResolvedValue(source('imported', 'Imported').candidate),
  };
}
function actions(title: string) {
  fireEvent.keyDown(screen.getByRole('button', { name: `Actions for ${title}` }), { key: 'Enter' });
}
it('selects multiple sources without applying them and combines only on explicit action', () => {
  const props = managerProps();
  render(<SchemaSourceManager {...props} />);
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Combine selected…' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Tasks for combination' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select People for combination' }));
  expect(props.onCombine).not.toHaveBeenCalled();
  expect(props.onRemove).not.toHaveBeenCalled();
  expect(screen.getByText('2 sources selected')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Combine selected…' }));
  expect(props.onCombine).toHaveBeenCalledExactlyOnceWith(['tasks', 'people']);
  expect(props.onOpenChange).not.toHaveBeenCalled();
});
it('preserves selection across filtering and inline steps', () => {
  const props = managerProps();
  const view = render(<SchemaSourceManager {...props} selection={['tasks']} />);
  fireEvent.change(screen.getByLabelText('Filter sources'), { target: { value: 'People' } });
  expect(
    screen.queryByRole('checkbox', { name: 'Select Tasks for combination' })
  ).not.toBeInTheDocument();
  expect(screen.getByText('1 source selected')).toBeVisible();
  view.rerender(<SchemaSourceManager {...props} composition={<p>Combination step</p>} />);
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  view.rerender(<SchemaSourceManager {...props} />);
  fireEvent.change(screen.getByLabelText('Filter sources'), { target: { value: '' } });
  expect(screen.getByRole('checkbox', { name: 'Select Tasks for combination' })).toBeChecked();
});
it('blocks referenced sources from removal and exposes removal in row actions', () => {
  const props = managerProps();
  const reason = 'This source is used by the current Schema edits.';
  render(<SchemaSourceManager {...props} removalBlockers={{ tasks: reason }} />);
  actions('Tasks');
  const blocked = screen.getByRole('menuitem', { name: 'Remove Tasks' });
  expect(blocked).toHaveAttribute('aria-disabled', 'true');
  expect(blocked).toHaveAccessibleDescription(reason);
  fireEvent.keyDown(blocked, { key: 'Escape' });
  actions('People');
  fireEvent.click(screen.getByRole('menuitem', { name: 'Remove People' }));
  expect(props.onRemove).toHaveBeenCalledExactlyOnceWith('people');
});
it('keeps operation failures visible', () => {
  render(<SchemaSourceManager {...managerProps()} modules={[]} error="Could not remove source." />);
  expect(screen.getByRole('alert')).toHaveTextContent('Could not remove source.');
  expect(screen.queryByText(/No sources yet/)).not.toBeInTheDocument();
});
it('explains why combining is unavailable while preserving source management', () => {
  const props = managerProps();
  const reason = 'Fix the field errors before combining sources.';
  render(<SchemaSourceManager {...props} selection={['tasks']} combineDisabledReason={reason} />);
  const button = screen.getByRole('button', { name: 'Combine selected…' });
  expect(button).toBeDisabled();
  expect(button).toHaveAccessibleDescription(reason);
  expect(screen.getByRole('button', { name: 'Import schema…' })).toBeEnabled();
});
function importRelease() {
  return {
    identity: {
      displayName: 'Notes',
      canonicalName: 'team/notes',
      ownerProjectId: 'publisher',
      description: 'Reusable notes',
    },
    release: {
      artifactVersionId: 'notes-v2',
      version: '2.0.0',
      hash: 'sha256:pinned',
      kind: 'schema',
    },
  };
}
it('imports the exact catalog release into sources inside the same dialog', async () => {
  catalog.data.items = [importRelease()];
  const props = managerProps();
  render(<SchemaSourceManager {...props} selection={['tasks']} />);
  fireEvent.click(screen.getByRole('button', { name: 'Import schema…' }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  fireEvent.click(screen.getByRole('radio', { name: 'Import Notes @ 2.0.0' }));
  expect(props.onImport).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Import source' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Combine selected…' })).toBeVisible()
  );
  expect(props.onImport).toHaveBeenCalledExactlyOnceWith({
    sourceProjectId: 'publisher',
    canonicalName: 'team/notes',
    version: '2.0.0',
    expectedHash: 'sha256:pinned',
  });
  expect(screen.getByRole('checkbox', { name: 'Select Tasks for combination' })).toBeChecked();
  expect(props.onCombine).not.toHaveBeenCalled();
});
it('retains failed imports and selections for retry', async () => {
  catalog.data.items = [importRelease()];
  const props = managerProps();
  props.onImport.mockRejectedValue(new Error('Permission changed'));
  render(<SchemaSourceManager {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Import schema…' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Import Notes @ 2.0.0' }));
  fireEvent.click(screen.getByRole('button', { name: 'Import source' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Permission changed'));
  expect(screen.getByRole('radio', { name: 'Import Notes @ 2.0.0' })).toBeChecked();
  expect(screen.getByRole('button', { name: 'Import source' })).toBeEnabled();
  expect(props.onOpenChange).not.toHaveBeenCalled();
});
it('locks dismissal and duplicate imports while saving', async () => {
  catalog.data.items = [importRelease()];
  const props = managerProps();
  let finish!: () => void;
  props.onImport.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => resolve(source('notes', 'Notes').candidate);
      })
  );
  render(<SchemaSourceManager {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Import schema…' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Import Notes @ 2.0.0' }));
  fireEvent.click(screen.getByRole('button', { name: 'Import source' }));
  expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(props.onOpenChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Importing…' }));
  expect(props.onImport).toHaveBeenCalledTimes(1);
  finish();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Import schema…' })).toBeVisible());
});
it('keeps the Sources sidebar visible even with no materials and no hide control', () => {
  const props = {
    rows: [],
    visible: [],
    disabled: false,
    projectId: 'project',
    sources: [],
    onMove: vi.fn(),
    onImport: vi.fn(),
    onSelect: vi.fn(),
    renderRow: () => null,
  };
  const { rerender } = render(<SchemaFieldTree {...props} />);
  expect(screen.getByRole('complementary', { name: 'Available Schema sources' })).toBeVisible();
  expect(screen.getByText('No sources added.')).toBeVisible();
  expect(screen.queryByRole('button', { name: /Hide sources|^Sources$/ })).not.toBeInTheDocument();
  rerender(<SchemaFieldTree {...props} disabled />);
  expect(screen.getByRole('complementary', { name: 'Available Schema sources' })).toBeVisible();
});
