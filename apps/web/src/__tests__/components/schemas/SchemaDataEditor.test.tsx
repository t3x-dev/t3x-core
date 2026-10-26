// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SchemaDataEditor } from '@/components/schemas/SchemaDataEditor';
import { schemaSourceKey } from '@/domain/schemas/schemaProvenance';

const definition = {
  yschema: '0.1',
  name: 'checklist',
  strict: true,
  nodes: {
    checklist: {
      slots: { title: { type: 'string', maxLength: 100 } },
      requiredSlots: ['title'],
      children: { items: { repeated: true, slots: { done: { type: 'boolean', default: false } } } },
    },
  },
};
const callbacks = () => ({
  onPreview: vi.fn(),
  onSave: vi.fn().mockResolvedValue(undefined),
  onDirtyChange: vi.fn(),
  onDiscard: vi.fn(),
});

describe('Schema data editor', () => {
  it('shows a failed preview and retry instead of an endless loading placeholder', () => {
    const onRetry = vi.fn();
    render(
      <SchemaDataEditor
        revisionKey="failed"
        loading={false}
        previewError="Source unavailable"
        onRetry={onRetry}
        {...callbacks()}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Source unavailable');
    expect(screen.queryByText('Loading Schema definition…')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Schema' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
  it('restores the visible name when a referenced node cannot be renamed', () => {
    const handlers = callbacks();
    render(
      <SchemaDataEditor
        initialDefinition={{
          ...definition,
          relationTypes: { includes: { from: 'checklist', to: 'checklist/items' } },
        }}
        revisionKey="1"
        {...handlers}
      />
    );
    fireEvent.change(screen.getByLabelText('Name checklist'), { target: { value: 'tasks' } });
    fireEvent.blur(screen.getByLabelText('Name checklist'));
    expect(screen.getByLabelText('Name checklist')).toHaveValue('checklist');
    expect(screen.getByRole('alert')).toHaveTextContent('referenced');
    expect(handlers.onPreview).not.toHaveBeenCalled();
  });
  it('edits nested fields and required status, renames, saves and restores the saved definition', async () => {
    const handlers = callbacks();
    const view = render(
      <SchemaDataEditor initialDefinition={definition} revisionKey="1" {...handlers} />
    );
    fireEvent.change(screen.getByLabelText('Name checklist/title'), {
      target: { value: 'heading' },
    });
    fireEvent.blur(screen.getByLabelText('Name checklist/title'));
    expect(screen.getByLabelText('Required checklist/heading')).toBeChecked();
    fireEvent.change(screen.getByLabelText('Type checklist/items/done'), {
      target: { value: 'string' },
    });
    fireEvent.click(screen.getByLabelText('Required checklist/items/done'));
    fireEvent.click(screen.getByRole('button', { name: 'Save candidate' }));
    await waitFor(() => expect(handlers.onSave).toHaveBeenCalledTimes(1));
    const saved = handlers.onSave.mock.calls[0]![0];
    expect(saved.nodes.checklist.requiredSlots).toEqual(['heading']);
    expect(saved.nodes.checklist.children.items.requiredSlots).toEqual(['done']);
    expect(saved.nodes.checklist.children.items.slots.done).toEqual({
      type: 'string',
      default: false,
    });
    view.unmount();
    render(<SchemaDataEditor initialDefinition={saved} revisionKey="2" {...callbacks()} />);
    expect(screen.getByLabelText('Type checklist/items/done')).toHaveValue('string');
    expect(screen.getByLabelText('Name checklist/heading')).toHaveValue('heading');
  });
  it('preserves local input through preview refresh and rejects saving over an external revision', async () => {
    const handlers = callbacks();
    const view = render(
      <SchemaDataEditor initialDefinition={definition} revisionKey="1" {...handlers} />
    );
    fireEvent.change(screen.getByLabelText('Type checklist/title'), {
      target: { value: 'number' },
    });
    view.rerender(<SchemaDataEditor initialDefinition={undefined} revisionKey="1" {...handlers} />);
    expect(screen.getByLabelText('Type checklist/title')).toHaveValue('number');
    view.rerender(
      <SchemaDataEditor initialDefinition={definition} revisionKey="2" {...handlers} />
    );
    expect(screen.getByLabelText('Type checklist/title')).toHaveValue('number');
    expect(screen.getByRole('alert')).toHaveTextContent('changed elsewhere');
    expect(screen.getByRole('button', { name: 'Save candidate' })).toBeDisabled();
    expect(handlers.onSave).not.toHaveBeenCalled();
  });
  it('uses shared attribute controls and blocks invalid JSON without losing it', async () => {
    const handlers = callbacks();
    render(<SchemaDataEditor initialDefinition={definition} revisionKey="1" {...handlers} />);
    fireEvent.focus(screen.getByLabelText('Name checklist/title'));
    fireEvent.change(screen.getByLabelText('default for slot checklist/title'), {
      target: { value: '{' },
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save candidate' })).toBeDisabled()
    );
    fireEvent.change(screen.getByLabelText('Type checklist/items/done'), {
      target: { value: 'string' },
    });
    expect(screen.getByLabelText('default for slot checklist/title')).toHaveValue('{');
    fireEvent.change(screen.getByLabelText('default for slot checklist/title'), {
      target: { value: '"Untitled"' },
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save candidate' })).toBeEnabled()
    );
  });
});

it('shows exact node sources without selecting or changing the node and marks subsequent local edits', async () => {
  const handlers = callbacks();
  const pin = {
    projectId: 'source-project',
    canonicalName: '@team/checklist',
    version: '1.2.0',
    artifactVersionId: 'checklist-v1',
    hash: `sha256:${'a'.repeat(64)}`,
  };
  render(
    <SchemaDataEditor
      initialDefinition={definition}
      revisionKey="source-test"
      {...handlers}
      provenance={{
        schema: definition,
        sources: [pin],
        origins: {
          checklist: { kind: 'module', artifact: pin.canonicalName, version: pin.version },
        },
      }}
      sourceIdentities={{ [schemaSourceKey(pin)]: { name: 'Checklist', projectId: pin.projectId } }}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Source for checklist: Checklist @ 1.2.0' }));
  const link = await screen.findByRole('link', { name: 'View exact release ↗' });
  const query = new URL(link.getAttribute('href')!, 'https://example.test').searchParams;
  expect(query.get('catalogHash')).toBe(pin.hash);
  expect(query.get('catalogVersion')).toBe(pin.version);
  expect(query.get('sourceProjectId')).toBe(pin.projectId);
  expect(link).toHaveAttribute('target', '_blank');
  expect(screen.getByText('Original Commit link unavailable for this source.')).toBeVisible();
  expect(handlers.onPreview).not.toHaveBeenCalled();
  expect(handlers.onSave).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  fireEvent.click(screen.getByLabelText('Required checklist'));
  expect(
    screen.getByRole('button', { name: 'Source for checklist: Checklist @ 1.2.0 + local edits' })
  ).toBeVisible();
});

it('opens the verified original project and Commit without replacing it with the current Release', async () => {
  const commitDigest = `sha256:${'c'.repeat(64)}`;
  const pin = {
    projectId: null,
    canonicalName: 'team/released',
    version: '2.0.0',
    artifactVersionId: 'released-2',
    hash: `sha256:${'d'.repeat(64)}`,
  };
  render(
    <SchemaDataEditor
      initialDefinition={definition}
      revisionKey="committed"
      {...callbacks()}
      wholeSchemaSource={pin}
      provenance={{
        schema: definition,
        sources: [pin],
        origins: {},
        nodeProvenance: {
          version: 1,
          byPath: {
            checklist: [
              {
                source: pin,
                commitRef: {
                  projectId: 'original/project',
                  commitDigest,
                  schemaHash: `sha256:${'e'.repeat(64)}`,
                  sourcePath: 'original/checklist',
                },
              },
            ],
          },
        },
      }}
    />
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Source for checklist: team/released @ 2.0.0' })
  );
  const link = await screen.findByRole('link', { name: 'View source Commit ↗' });
  const url = new URL(link.getAttribute('href')!, 'https://example.test');
  expect(url.pathname).toBe('/project/original%2Fproject/history');
  expect(url.searchParams.get('commit')).toBe(commitDigest);
  expect(link).toHaveAttribute('target', '_blank');
  expect(screen.getByText('original/checklist')).toBeVisible();
  expect(screen.getByRole('link', { name: 'View exact release ↗' })).toBeVisible();
  expect(
    screen.queryByText('Original Commit link unavailable for this source.')
  ).not.toBeInTheDocument();
});
