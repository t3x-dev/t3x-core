// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SchemaDataEditor } from '@/components/schemas/SchemaDataEditor';
import { schemaSourceKey } from '@/domain/schemas/schemaProvenance';

const flow = vi.hoisted(() => ({
  props: undefined as any,
  source: undefined as
    | {
        schema: Record<string, unknown>;
        schemaHash: string;
        report: { valid: boolean };
        adoption: { allowed: boolean };
      }
    | undefined,
}));
vi.mock('@/hooks/schemas/useStudioPreview', () => ({
  useStudioPreview: () => ({ data: flow.source, refresh: vi.fn() }),
}));
vi.mock('@xyflow/react', () => ({
  Position: { Left: 'left', Right: 'right' },
  Handle: () => null,
  Background: () => null,
  Controls: () => null,
  ReactFlow: (props: any) => {
    flow.props = props;
    return (
      <div>
        {props.nodes.map((node: any) => {
          const Card = props.nodeTypes[node.type];
          return <Card key={node.id} data={node.data} />;
        })}
      </div>
    );
  },
}));
const definition = {
  yschema: '0.1',
  name: 'visual',
  nodes: {
    tasks: { slots: { title: { type: 'string' } }, requiredSlots: ['title'] },
    owner: { slots: {} },
  },
};
it('moves object fields and whole node subtrees while keeping Fields and Visual in sync', async () => {
  const object = {
    type: 'object',
    properties: { enabled: { type: 'boolean' } },
    additionalProperties: false,
  };
  const initialDefinition = {
    ...definition,
    nodes: {
      ...definition.nodes,
      config: {
        slots: { options: object },
        requiredSlots: ['options'],
        children: { nested: { slots: {} } },
      },
    },
  };
  const handlers = {
    onPreview: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    onDirtyChange: vi.fn(),
    onDiscard: vi.fn(),
  };
  const view = render(
    <SchemaDataEditor
      initialDefinition={initialDefinition}
      revisionKey="move"
      view="visual"
      {...handlers}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Select object config/options' }));
  fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));
  fireEvent.change(screen.getByLabelText('Move object to node'), {
    target: { value: '["nodes","owner"]' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Move object' }));
  expect(handlers.onPreview.mock.lastCall?.[0]).toHaveProperty('nodes.owner.slots.options', object);
  fireEvent.click(screen.getByRole('button', { name: 'Move node config' }));
  fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));
  fireEvent.change(screen.getByLabelText('Move node to parent'), {
    target: { value: '["nodes","tasks"]' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Move node', exact: true }));
  expect(handlers.onPreview.mock.lastCall?.[0]).toHaveProperty(
    'nodes.tasks.children.config.children.nested'
  );
  expect(handlers.onPreview.mock.lastCall?.[0]).not.toHaveProperty('nodes.config');
  view.rerender(
    <SchemaDataEditor
      initialDefinition={initialDefinition}
      revisionKey="move"
      view="data"
      {...handlers}
    />
  );
  expect(screen.getByLabelText('Name tasks/config/nested')).toBeVisible();
  expect(screen.getByLabelText('Required owner/options')).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await waitFor(() => expect(handlers.onSave).toHaveBeenCalledOnce());
});
it('shares definition and selection across Data/Visual, moves a field, adds a relation and saves once', async () => {
  const handlers = {
    onPreview: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    onDirtyChange: vi.fn(),
    onDiscard: vi.fn(),
  };
  const view = render(
    <SchemaDataEditor
      initialDefinition={definition}
      revisionKey="1"
      view="visual"
      layoutKey="visual-test"
      {...handlers}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Select field tasks/title' }));
  fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));
  fireEvent.change(screen.getByLabelText('Move field to node'), {
    target: { value: '["nodes","owner"]' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Move field' }));
  view.rerender(
    <SchemaDataEditor initialDefinition={definition} revisionKey="1" view="data" {...handlers} />
  );
  expect(screen.getByLabelText('Required owner/title')).toBeChecked();
  expect(screen.queryByLabelText('Name tasks/title')).not.toBeInTheDocument();
  view.rerender(
    <SchemaDataEditor initialDefinition={definition} revisionKey="1" view="visual" {...handlers} />
  );
  fireEvent.keyDown(screen.getByRole('button', { name: 'Canvas options' }), { key: 'Enter' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Relationships & rules' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add relationship type' }));
  fireEvent.change(screen.getByLabelText('To node for relation new_relation'), {
    target: { value: 'owner' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await waitFor(() => expect(handlers.onSave).toHaveBeenCalledTimes(1));
  expect(handlers.onSave.mock.calls[0]![0]).toHaveProperty('relationTypes.new_relation', {
    from: 'tasks',
    to: 'owner',
  });
});
it('automatically separates tall cards without changing the Schema or offering connection gestures', async () => {
  const onPreview = vi.fn();
  render(
    <SchemaDataEditor
      initialDefinition={{ ...definition, nodes: { ...definition.nodes, extra: { slots: {} } } }}
      revisionKey="layout"
      view="visual"
      onPreview={onPreview}
      onSave={vi.fn()}
      onDirtyChange={vi.fn()}
      onDiscard={vi.fn()}
    />
  );
  expect(screen.queryByRole('button', { name: 'Move to…' })).not.toBeInTheDocument();
  expect(screen.getByRole('complementary', { name: 'Schema properties' })).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Add relation', exact: true })
  ).not.toBeInTheDocument();
  const node = flow.props.nodes[0];
  const { act } = await import('@testing-library/react');
  act(() =>
    flow.props.onNodesChange([
      { type: 'dimensions', id: node.id, dimensions: { width: 270, height: 600 } },
    ])
  );
  expect(flow.props.nodes[2].position.y).toBeGreaterThanOrEqual(640);
  expect(flow.props.nodesDraggable).toBe(false);
  expect(flow.props.nodesConnectable).toBe(false);
  expect(onPreview).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
});

it('uses the same exact source badges in Structure and Visual', () => {
  const pin = {
    projectId: 'source',
    canonicalName: '@team/tasks',
    version: '1.0',
    artifactVersionId: 'v1',
    hash: `sha256:${'b'.repeat(64)}`,
  };
  const handlers = {
    onPreview: vi.fn(),
    onSave: vi.fn(),
    onDirtyChange: vi.fn(),
    onDiscard: vi.fn(),
  };
  const props = {
    initialDefinition: definition,
    revisionKey: 'provenance',
    ...handlers,
    provenance: {
      schema: definition,
      sources: [pin],
      origins: { tasks: { kind: 'module', artifact: pin.canonicalName, version: pin.version } },
    },
    sourceIdentities: { [schemaSourceKey(pin)]: { name: 'Tasks', projectId: 'source' } },
  };
  const view = render(<SchemaDataEditor {...props} view="data" />);
  expect(screen.getByRole('button', { name: 'Origin for tasks: Tasks @ 1.0' })).toBeVisible();
  view.rerender(<SchemaDataEditor {...props} view="visual" />);
  expect(screen.getByRole('button', { name: 'Origin for tasks: Tasks @ 1.0' })).toBeVisible();
  expect(handlers.onPreview).not.toHaveBeenCalled();
});

const nestedDefinition = {
  ...definition,
  nodes: {
    ...definition.nodes,
    project: {
      children: {
        task: {
          slots: { options: { type: 'object' } },
          children: { detail: { slots: {} } },
        },
      },
    },
  },
  relationTypes: { assigned: { from: 'tasks', to: 'owner' } },
};
const parentEdges = () =>
  flow.props.edges.filter((edge: { id: string }) => edge.id.startsWith('parent:'));
function chooseParentLines(name: string) {
  fireEvent.keyDown(screen.getByRole('button', { name: 'Canvas options' }), { key: 'Enter' });
  fireEvent.click(screen.getByRole('menuitemradio', { name }));
}

it('switches all three parent-line modes using the same node and object selection as the editor', () => {
  render(
    <SchemaDataEditor
      initialDefinition={nestedDefinition}
      revisionKey="lines"
      view="visual"
      onPreview={vi.fn()}
      onSave={vi.fn()}
      onDirtyChange={vi.fn()}
      onDiscard={vi.fn()}
    />
  );
  expect(parentEdges()).toHaveLength(0);
  chooseParentLines('All');
  expect(parentEdges()).toHaveLength(2);
  chooseParentLines('Hidden');
  fireEvent.click(screen.getByRole('button', { name: 'Move node project', exact: true }));
  expect(flow.props.edges.map((edge: { id: string }) => edge.id)).toEqual(['relation:assigned']);
  chooseParentLines('On selection');
  expect(parentEdges()).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Clear details' }));
  expect(parentEdges()).toHaveLength(0);

  // React Flow forwards clicks on non-button areas of a card through onNodeClick.
  const project = flow.props.nodes.find(
    (node: { id: string }) => node.id === '["nodes","project"]'
  );
  const parentLabel = within(
    screen.getByRole('region', { name: 'Node project', exact: true })
  ).getByText('Node · Parent: Root');
  act(() => flow.props.onNodeClick({ target: parentLabel }, project));
  expect(parentEdges()).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Move node project', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );

  const object = screen.getByRole('button', { name: 'Select object project/task/options' });
  fireEvent.click(object);
  const task = flow.props.nodes.find(
    (node: { id: string }) => node.id === '["nodes","project","children","task"]'
  );
  act(() => flow.props.onNodeClick({ target: object.querySelector('span') }, task));
  expect(object).toHaveAttribute('aria-pressed', 'true');
  expect(task.selected).toBe(true);
  expect(parentEdges()).toHaveLength(2);
  act(() => flow.props.onPaneClick());
  expect(parentEdges()).toHaveLength(0);
  expect(flow.props.nodes.every((node: { selected: boolean }) => !node.selected)).toBe(true);
  expect(flow.props.edges.map((edge: { id: string }) => edge.id)).toEqual(['relation:assigned']);
});

it.each([
  'All',
  'Hidden',
])('keeps %s parent lines when switching Fields/Visual or undoing edits', (mode) => {
  const props = {
    initialDefinition: nestedDefinition,
    revisionKey: 'persistent-lines',
    onPreview: vi.fn(),
    onSave: vi.fn(),
    onDirtyChange: vi.fn(),
    onDiscard: vi.fn(),
  };
  const view = render(<SchemaDataEditor {...props} view="visual" />);
  chooseParentLines(mode);
  view.rerender(<SchemaDataEditor {...props} view="data" />);
  view.rerender(<SchemaDataEditor {...props} view="visual" />);
  expect(parentEdges()).toHaveLength(mode === 'All' ? 2 : 0);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Canvas options' }), { key: 'Enter' });
  expect(screen.getByRole('menuitemradio', { name: mode })).toHaveAttribute('aria-checked', 'true');
  fireEvent.click(screen.getByRole('menuitemradio', { name: mode }));
  expect(props.onPreview).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();

  fireEvent.click(
    within(screen.getByRole('region', { name: 'Node project', exact: true })).getByRole('button', {
      name: '+ Add field',
    })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(parentEdges()).toHaveLength(mode === 'All' ? 2 : 0);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Canvas options' }), { key: 'Enter' });
  expect(screen.getByRole('menuitemradio', { name: mode })).toHaveAttribute('aria-checked', 'true');
});

it('imports source objects with a rename decision, undo, and source mappings in the saved candidate', async () => {
  const object = {
    type: 'object',
    default: { name: 'Reviewer' },
  };
  flow.source = {
    schema: { nodes: { person: { slots: { owner: object }, requiredSlots: ['owner'] } } },
    schemaHash: `sha256:${'a'.repeat(64)}`,
    report: { valid: true },
    adoption: { allowed: true },
  };
  const onPreview = vi.fn(),
    onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <SchemaDataEditor
      projectId="project"
      initialDefinition={{ nodes: { project: { slots: { owner: { type: 'object' } } } } }}
      revisionKey="imports"
      view="visual"
      sources={[
        {
          id: 'people',
          projectId: 'project',
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
      onPreview={onPreview}
      onSave={onSave}
      onDirtyChange={vi.fn()}
      onDiscard={vi.fn()}
    />
  );
  fireEvent.click(screen.getByText('People'));
  fireEvent.click(await screen.findByRole('button', { name: 'Select source object person/owner' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add to draft…' }));
  fireEvent.change(screen.getByLabelText('Move object to node'), {
    target: { value: '["nodes","project"]' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Import object' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(onPreview).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  expect(onPreview).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Add to draft…' }));
  fireEvent.click(screen.getByRole('button', { name: 'Import object' }));
  fireEvent.change(screen.getByLabelText('New name'), { target: { value: 'reviewer' } });
  fireEvent.click(screen.getByRole('button', { name: 'Rename and continue' }));
  expect(onPreview.mock.lastCall?.[0]).toHaveProperty('nodes.project.slots.reviewer', object);
  expect(onPreview.mock.lastCall?.[1]).toEqual([
    {
      path: ['nodes', 'project', 'slots', 'reviewer'],
      from: ['nodes', 'person', 'slots', 'owner'],
      source: { candidateId: 'people', schemaHash: flow.source.schemaHash },
    },
  ]);
  fireEvent.click(screen.getByRole('button', { name: 'Undo', exact: true }));
  expect(onPreview.mock.lastCall?.[0]).not.toHaveProperty('nodes.project.slots.reviewer');
  expect(onPreview.mock.lastCall?.[1]).toEqual([]);
  fireEvent.click(screen.getByText('People'));
  fireEvent.click(await screen.findByRole('button', { name: 'Select source object person/owner' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add to draft…' }));
  fireEvent.change(screen.getByLabelText('Move object to node'), {
    target: { value: '["nodes","project"]' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Import object' }));
  fireEvent.change(screen.getByLabelText('New name'), { target: { value: 'reviewer' } });
  fireEvent.click(screen.getByRole('button', { name: 'Rename and continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
  expect(onSave.mock.lastCall?.[2]).toEqual(onPreview.mock.lastCall?.[1]);
});
