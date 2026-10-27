// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SchemaDataEditor } from '@/components/schemas/SchemaDataEditor';
import { schemaSourceKey } from '@/domain/schemas/schemaProvenance';

vi.mock('@/hooks/schemas/useStudioPreview', () => ({
  useStudioPreview: () => ({
    data: {
      schema: {
        nodes: {
          person: {
            slots: { profile: { type: 'object', properties: { name: { type: 'string' } } } },
            requiredSlots: ['profile'],
            children: { address: { slots: { city: { type: 'string' } } } },
          },
        },
      },
      schemaHash: 'sha256:source',
      report: { valid: true },
      adoption: { allowed: true },
    },
    refresh: vi.fn(),
  }),
}));

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
  it.each([
    ['node person', 'root', 'nodes.person.children.address.slots.city'],
    ['object person/profile', '["nodes","project"]', 'nodes.project.slots.profile.properties.name'],
  ])('copies a source %s from the visible source palette and preserves its origin', async (item, destination, path) => {
    const handlers = callbacks();
    render(
      <SchemaDataEditor
        projectId="p"
        initialDefinition={{ nodes: { project: { slots: {} } } }}
        revisionKey="source-copy"
        sources={[
          {
            id: 'people',
            projectId: 'p',
            studioId: 'main',
            createdAt: '',
            title: 'People',
            available: true,
            source: null,
            description: null,
            kind: 'schema',
            license: null,
            reason: null,
          },
        ]}
        {...handlers}
      />
    );
    expect(screen.getByRole('complementary', { name: 'Available Schema sources' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: `Select source ${item}` }));
    fireEvent.change(screen.getByLabelText('Destination node'), { target: { value: destination } });
    fireEvent.click(screen.getByRole('button', { name: 'Import here' }));
    expect(handlers.onPreview.mock.lastCall?.[0]).toHaveProperty(path, { type: 'string' });
    const mappings = handlers.onPreview.mock.lastCall?.[1];
    expect(mappings).toHaveLength(item.startsWith('node') ? 4 : 1);
    for (const mapping of mappings) {
      expect(mapping.source).toEqual({ candidateId: 'people', schemaHash: 'sha256:source' });
    }
    expect(screen.getByRole('button', { name: `Select source ${item}` })).toBeVisible();
    if (item.startsWith('object'))
      expect(screen.getByLabelText('Required project/profile')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Save edits' }));
    await waitFor(() => expect(handlers.onSave).toHaveBeenCalledOnce());
    expect(handlers.onSave.mock.lastCall?.[2]).toEqual(handlers.onPreview.mock.lastCall?.[1]);
  });

  it('moves a required field in Fields and can undo without losing its constraints', () => {
    const handlers = callbacks();
    render(<SchemaDataEditor initialDefinition={definition} revisionKey="move" {...handlers} />);
    fireEvent.focus(screen.getByLabelText('Name checklist/title'));
    fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));
    fireEvent.change(screen.getByLabelText('Destination node'), {
      target: { value: '["nodes","checklist","children","items"]' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Move here' }));
    expect(screen.getByLabelText('Required checklist/items/title')).toBeChecked();
    expect(handlers.onPreview.mock.lastCall?.[0]).toHaveProperty(
      'nodes.checklist.children.items.slots.title',
      { type: 'string', maxLength: 100 }
    );
    expect(screen.queryByLabelText('Name checklist/title')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Name checklist/title')).toBeVisible();
    expect(screen.getByLabelText('Required checklist/title')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Save edits' })).toBeDisabled();
    expect(handlers.onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('clears unsaved changes when a field is restored, regardless of object key order', () => {
    const handlers = callbacks();
    render(<SchemaDataEditor initialDefinition={definition} revisionKey="restore" {...handlers} />);
    fireEvent.change(screen.getByLabelText('Type checklist/title'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Save edits' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Type checklist/title'), {
      target: { value: 'string' },
    });
    expect(handlers.onPreview.mock.lastCall?.[0]).toEqual(definition);
    expect(handlers.onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: 'Save edits' })).toBeDisabled();
  });

  it('clears unsaved changes after a rename is reversed, including its local mapping', () => {
    const handlers = callbacks();
    render(<SchemaDataEditor initialDefinition={definition} revisionKey="rename" {...handlers} />);
    fireEvent.change(screen.getByLabelText('Name checklist/title'), {
      target: { value: 'heading' },
    });
    fireEvent.blur(screen.getByLabelText('Name checklist/title'));
    expect(screen.getByRole('button', { name: 'Save edits' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Name checklist/heading'), {
      target: { value: 'title' },
    });
    fireEvent.blur(screen.getByLabelText('Name checklist/heading'));
    expect(handlers.onPreview.mock.lastCall?.[0]).toEqual(definition);
    expect(handlers.onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: 'Save edits' })).toBeDisabled();
  });

  it('clears unsaved changes after adding and deleting a field', async () => {
    const handlers = callbacks();
    render(
      <SchemaDataEditor initialDefinition={definition} revisionKey="add-delete" {...handlers} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add to checklist', exact: true }));
    expect(screen.getByRole('button', { name: 'Save edits' })).toBeEnabled();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for checklist/new_field' }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete', exact: true }));
    expect(handlers.onPreview.mock.lastCall?.[0]).toEqual(definition);
    expect(handlers.onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: 'Save edits' })).toBeDisabled();
  });

  it('keeps a changed source origin dirty even when the imported definition is identical', async () => {
    const handlers = callbacks();
    const original = {
      nodes: {
        person: {
          slots: { profile: { type: 'object', properties: { name: { type: 'string' } } } },
          requiredSlots: ['profile'],
          children: { address: { slots: { city: { type: 'string' } } } },
        },
      },
    };
    render(
      <SchemaDataEditor
        projectId="p"
        initialDefinition={original}
        revisionKey="origin-change"
        sources={[
          {
            id: 'people',
            projectId: 'p',
            studioId: 'main',
            createdAt: '',
            title: 'People',
            available: true,
            source: null,
            description: null,
            kind: 'schema',
            license: null,
            reason: null,
          },
        ]}
        {...handlers}
      />
    );
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for person', exact: true }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Select source node person', exact: true }));
    fireEvent.change(screen.getByLabelText('Destination node'), { target: { value: 'root' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import here' }));
    expect(handlers.onPreview.mock.lastCall?.[0]).toEqual(original);
    expect(handlers.onPreview.mock.lastCall?.[1]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: { candidateId: 'people', schemaHash: 'sha256:source' } }),
      ])
    );
    expect(handlers.onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('button', { name: 'Save edits' })).toBeEnabled();
  });

  it('compares later edits with the successful save rather than the original input', async () => {
    const handlers = callbacks();
    render(
      <SchemaDataEditor initialDefinition={definition} revisionKey="save-baseline" {...handlers} />
    );
    fireEvent.change(screen.getByLabelText('Type checklist/title'), {
      target: { value: 'number' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save edits' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save edits' })).toBeDisabled());
    fireEvent.change(screen.getByLabelText('Type checklist/title'), {
      target: { value: 'string' },
    });
    expect(screen.getByRole('button', { name: 'Save edits' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Type checklist/title')).toHaveValue('number');
    expect(handlers.onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: 'Save edits' })).toBeDisabled();
  });

  it('preserves input and the previous saved baseline after a failed save', async () => {
    const handlers = callbacks();
    handlers.onSave.mockRejectedValueOnce(new Error('Save failed'));
    render(
      <SchemaDataEditor initialDefinition={definition} revisionKey="save-failure" {...handlers} />
    );
    fireEvent.change(screen.getByLabelText('Type checklist/title'), {
      target: { value: 'number' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save edits' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed');
    expect(screen.getByLabelText('Type checklist/title')).toHaveValue('number');
    expect(handlers.onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('button', { name: 'Save edits' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Type checklist/title'), {
      target: { value: 'string' },
    });
    expect(handlers.onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: 'Save edits' })).toBeDisabled();
  });

  it('keeps an unsaved blank Schema dirty after undoing its first edit', async () => {
    const handlers = callbacks();
    render(
      <SchemaDataEditor
        initialDefinition={{ yschema: '0.1', name: 'Blank', nodes: {} }}
        initiallyDirty
        revisionKey="unsaved-blank"
        {...handlers}
      />
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Add', exact: true }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Root node' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: 'Save edits' })).toBeEnabled();
    expect(handlers.onDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Save edits' }));
    await waitFor(() => expect(handlers.onDirtyChange).toHaveBeenLastCalledWith(false));
  });

  it('keeps node operations in the row menu and excludes invalid move destinations', () => {
    render(<SchemaDataEditor initialDefinition={definition} revisionKey="menu" {...callbacks()} />);
    expect(screen.queryByRole('menuitem', { name: 'Add field' })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Actions for checklist' }), {
      key: 'Enter',
    });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add field', exact: true }));
    expect(screen.getByLabelText('Name checklist/new_field')).toBeVisible();
    fireEvent.focus(screen.getByLabelText('Name checklist'));
    fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));
    expect(screen.queryByRole('option', { name: 'checklist' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'checklist/items' })).not.toBeInTheDocument();
  });

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
    fireEvent.click(screen.getByRole('button', { name: 'Save edits' }));
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
    expect(screen.getByRole('button', { name: 'Save edits' })).toBeDisabled();
    expect(handlers.onSave).not.toHaveBeenCalled();
  });
  it('uses shared attribute controls and blocks invalid JSON without losing it', async () => {
    const handlers = callbacks();
    render(<SchemaDataEditor initialDefinition={definition} revisionKey="1" {...handlers} />);
    fireEvent.focus(screen.getByLabelText('Name checklist/title'));
    fireEvent.change(screen.getByLabelText('default for slot checklist/title'), {
      target: { value: '{' },
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save edits' })).toBeDisabled());
    fireEvent.change(screen.getByLabelText('Type checklist/items/done'), {
      target: { value: 'string' },
    });
    expect(screen.getByLabelText('default for slot checklist/title')).toHaveValue('{');
    fireEvent.change(screen.getByLabelText('default for slot checklist/title'), {
      target: { value: '"Untitled"' },
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save edits' })).toBeEnabled());
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
  const link = await screen.findByRole('link', { name: 'View release ↗' });
  const query = new URL(link.getAttribute('href')!, 'https://example.test').searchParams;
  expect(query.get('catalogHash')).toBe(pin.hash);
  expect(query.get('catalogVersion')).toBe(pin.version);
  expect(query.get('sourceProjectId')).toBe(pin.projectId);
  expect(link).toHaveAttribute('target', '_blank');
  expect(screen.getByText('Original commit unavailable.')).not.toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Details' }));
  expect(screen.getByText(pin.hash)).toBeVisible();
  expect(screen.getByText('Original commit unavailable.')).toBeVisible();
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
  fireEvent.click(await screen.findByRole('button', { name: 'Details' }));
  const link = await screen.findByRole('link', { name: 'View source Commit ↗' });
  const url = new URL(link.getAttribute('href')!, 'https://example.test');
  expect(url.pathname).toBe('/project/original%2Fproject/history');
  expect(url.searchParams.get('commit')).toBe(commitDigest);
  expect(link).toHaveAttribute('target', '_blank');
  expect(screen.getByText('original/checklist')).toBeVisible();
  expect(screen.getByRole('link', { name: 'View release ↗' })).toBeVisible();
  expect(screen.queryByText('Original commit unavailable.')).not.toBeInTheDocument();
});

it('adds fields through the shared Add menu with an explicit parent and opens contextual properties', async () => {
  const handlers = callbacks();
  render(
    <SchemaDataEditor
      initialDefinition={definition}
      revisionKey="r1"
      loading={false}
      {...handlers}
    />
  );
  expect(
    screen.queryByRole('complementary', { name: 'Schema properties' })
  ).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Add', exact: true }), { key: 'Enter' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Field…' }));
  const parent = screen.getByLabelText('Parent node');
  expect(screen.getByRole('button', { name: 'Add field', exact: true })).toBeDisabled();
  fireEvent.change(parent, { target: { value: '["nodes","checklist"]' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add field', exact: true }));
  await waitFor(() =>
    expect(handlers.onPreview).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nodes: expect.objectContaining({
          checklist: expect.objectContaining({
            slots: expect.objectContaining({ new_field: { type: 'string' } }),
          }),
        }),
      }),
      expect.any(Array)
    )
  );
  expect(screen.getByRole('complementary', { name: 'Schema properties' })).toBeVisible();
});

describe('Schema editor lifecycle states', () => {
  it('keeps the same tree and toolbar for loading, failure, unbound and empty definitions', async () => {
    const handlers = callbacks();
    const create = vi.fn();
    const retry = vi.fn();
    const props = {
      ...handlers,
      revisionKey: 'empty',
      sources: [],
      sourceManagement: <button type="button">Manage sources</button>,
      onCreateBlank: create,
      onRetry: retry,
    };
    const { rerender } = render(<SchemaDataEditor {...props} loading />);
    const shell = screen.getByRole('region', { name: 'Schema data editor' });
    expect(screen.getByText('Loading Schema definition…')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Create blank Schema' })).not.toBeInTheDocument();
    rerender(<SchemaDataEditor {...props} loading={false} previewError="Snapshot missing" />);
    expect(screen.getByRole('region', { name: 'Schema data editor' })).toBe(shell);
    expect(screen.getByRole('alert')).toHaveTextContent('Snapshot missing');
    fireEvent.click(screen.getByRole('button', { name: 'Retry Schema' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Create blank Schema' })).not.toBeInTheDocument();
    rerender(<SchemaDataEditor {...props} loading={false} />);
    expect(screen.getByRole('region', { name: 'Schema data editor' })).toBe(shell);
    fireEvent.click(screen.getByRole('button', { name: 'Create blank Schema' }));
    expect(create).toHaveBeenCalledOnce();
    expect(handlers.onSave).not.toHaveBeenCalled();
    rerender(
      <SchemaDataEditor
        {...props}
        loading={false}
        initiallyDirty
        initialDefinition={{ yschema: '0.1', name: 'Blank', nodes: {} }}
      />
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add', exact: true })).toBeEnabled()
    );
    expect(screen.getByRole('region', { name: 'Schema data editor' })).toBe(shell);
    expect(screen.getByText('No nodes yet. Add a node or drag one from Sources.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save edits' }));
    await waitFor(() =>
      expect(handlers.onSave).toHaveBeenCalledWith(
        { yschema: '0.1', name: 'Blank', nodes: {} },
        expect.any(String),
        []
      )
    );
  });
});

it('keeps an edited Schema after deleting its last node', async () => {
  const handlers = callbacks();
  render(
    <SchemaDataEditor
      {...handlers}
      loading={false}
      revisionKey="delete-last"
      initialDefinition={{ yschema: '0.1', name: 'Local', nodes: { note: { slots: {} } } }}
    />
  );
  fireEvent.pointerDown(await screen.findByRole('button', { name: 'Actions for note' }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete', exact: true }));
  expect(screen.getByText('No nodes yet. Add a node or drag one from Sources.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Create blank Schema' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add', exact: true })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Save edits' }));
  await waitFor(() =>
    expect(handlers.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ nodes: {} }),
      expect.any(String),
      []
    )
  );
});
