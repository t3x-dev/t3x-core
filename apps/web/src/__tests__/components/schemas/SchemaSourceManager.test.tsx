// @vitest-environment jsdom
import '@testing-library/jest-dom';
import type { StudioCandidate } from '@t3x-dev/api-client';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
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

function managerProps() {
  return {
    open: true,
    onOpenChange: vi.fn(),
    browseHref: '/projects/project/schemas/browse',
    modules: [source('tasks', 'Tasks'), source('people', 'People')],
    onRemove: vi.fn(),
    removalBlockers: {},
    pending: false,
    loading: false,
    onAdd: vi.fn(),
  };
}

it('lists reusable source materials without controls that switch the current definition', () => {
  const props = managerProps();
  render(<SchemaSourceManager {...props} />);
  expect(screen.getByText('Schema sources · 2')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Browse schema catalog' })).toHaveAttribute(
    'href',
    props.browseHref
  );
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Tasks'));
  expect(props.onRemove).not.toHaveBeenCalled();
  expect(props.onAdd).not.toHaveBeenCalled();
});

it('blocks only the referenced source from removal and shows the supplied reason', () => {
  const props = managerProps();
  const reason = 'This source is used by the current Schema edits.';
  render(<SchemaSourceManager {...props} removalBlockers={{ tasks: reason }} />);
  const blocked = screen.getByRole('button', { name: 'Remove Tasks' });
  expect(blocked).toBeDisabled();
  expect(blocked).toHaveAccessibleDescription(reason);
  expect(screen.getByText(reason)).toBeVisible();
  fireEvent.click(blocked);
  expect(props.onRemove).not.toHaveBeenCalled();
  const removable = screen.getByRole('button', { name: 'Remove People' });
  expect(removable).toBeEnabled();
  fireEvent.click(removable);
  expect(props.onRemove).toHaveBeenCalledExactlyOnceWith('people');
});

it('keeps source operation failures visible instead of showing an empty library', () => {
  render(<SchemaSourceManager {...managerProps()} modules={[]} error="Could not remove source." />);
  expect(screen.getByRole('alert')).toHaveTextContent('Could not remove source.');
  expect(screen.queryByText(/No sources yet/)).not.toBeInTheDocument();
});

it('opens source combination only through its explicit action', () => {
  const props = managerProps();
  render(<SchemaSourceManager {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Combine schemas…' }));
  expect(props.onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  expect(props.onAdd).toHaveBeenCalledOnce();
  expect(props.onRemove).not.toHaveBeenCalled();
});

it('explains why source combination is unavailable without blocking material removal', () => {
  const props = managerProps();
  const reason = 'Save or discard the current edits before combining sources.';
  render(<SchemaSourceManager {...props} combineDisabledReason={reason} />);
  const combine = screen.getByRole('button', { name: 'Combine schemas…' });
  expect(combine).toBeDisabled();
  expect(combine).toHaveAccessibleDescription(reason);
  expect(screen.getByText(reason)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Remove Tasks' })).toBeEnabled();
  fireEvent.click(combine);
  expect(props.onAdd).not.toHaveBeenCalled();
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
