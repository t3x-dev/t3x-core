// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  fireEvent.click(screen.getByRole('button', { name: 'Save candidate' }));
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
  fireEvent.keyDown(screen.getByRole('button', { name: 'More Schema actions' }), { key: 'Enter' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Relations & rules' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add relation type' }));
  fireEvent.change(screen.getByLabelText('to for relation new_relation'), {
    target: { value: 'owner' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save candidate' }));
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
  expect(
    screen.queryByRole('complementary', { name: 'Schema properties' })
  ).not.toBeInTheDocument();
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
  expect(screen.getByRole('button', { name: 'Save candidate' })).toBeDisabled();
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
  expect(screen.getByRole('button', { name: 'Source for tasks: Tasks @ 1.0' })).toBeVisible();
  view.rerender(<SchemaDataEditor {...props} view="visual" />);
  expect(screen.getByRole('button', { name: 'Source for tasks: Tasks @ 1.0' })).toBeVisible();
  expect(handlers.onPreview).not.toHaveBeenCalled();
});

it('shows parent lines on selection while keeping business relations independent', () => {
  render(
    <SchemaDataEditor
      initialDefinition={{
        ...definition,
        nodes: { ...definition.nodes, project: { children: { task: { slots: {} } } } },
        relationTypes: { assigned: { from: 'tasks', to: 'owner' } },
      }}
      revisionKey="lines"
      view="visual"
      onPreview={vi.fn()}
      onSave={vi.fn()}
      onDirtyChange={vi.fn()}
      onDiscard={vi.fn()}
    />
  );
  expect(flow.props.edges.map((edge: { id: string }) => edge.id)).toEqual(['relation:assigned']);
  fireEvent.click(screen.getByRole('button', { name: 'Move node project', exact: true }));
  expect(flow.props.edges).toHaveLength(2);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Canvas options' }), { key: 'Enter' });
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Hidden' }));
  expect(flow.props.edges.map((edge: { id: string }) => edge.id)).toEqual(['relation:assigned']);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Canvas options' }), { key: 'Enter' });
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'On selection' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close properties' }));
  expect(flow.props.edges).toHaveLength(1);
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
  fireEvent.click(screen.getByRole('button', { name: 'Import to…' }));
  fireEvent.change(screen.getByLabelText('Move object to node'), {
    target: { value: '["nodes","project"]' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Import object' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(onPreview).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  expect(onPreview).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Import to…' }));
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
  fireEvent.click(screen.getByRole('button', { name: 'Import to…' }));
  fireEvent.change(screen.getByLabelText('Move object to node'), {
    target: { value: '["nodes","project"]' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Import object' }));
  fireEvent.change(screen.getByLabelText('New name'), { target: { value: 'reviewer' } });
  fireEvent.click(screen.getByRole('button', { name: 'Rename and continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save candidate' }));
  await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
  expect(onSave.mock.lastCall?.[2]).toEqual(onPreview.mock.lastCall?.[1]);
});
