// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SchemaDataEditor } from '@/components/schemas/SchemaDataEditor';

const flow = vi.hoisted(() => ({ props: undefined as any }));
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
  fireEvent.change(screen.getByLabelText('Relation from node'), {
    target: { value: '["nodes","tasks"]' },
  });
  fireEvent.change(screen.getByLabelText('Relation to node'), {
    target: { value: '["nodes","owner"]' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add relation' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save candidate' }));
  await waitFor(() => expect(handlers.onSave).toHaveBeenCalledTimes(1));
  expect(handlers.onSave.mock.calls[0]![0]).toHaveProperty('relationTypes.relates_to', {
    from: 'tasks',
    to: 'owner',
  });
});
it('persists card positions separately without changing or saving the Schema', async () => {
  const handlers = {
    onPreview: vi.fn(),
    onSave: vi.fn(),
    onDirtyChange: vi.fn(),
    onDiscard: vi.fn(),
  };
  const view = render(
    <SchemaDataEditor
      initialDefinition={definition}
      revisionKey="1"
      view="visual"
      layoutKey="positions-test"
      {...handlers}
    />
  );
  const node = flow.props.nodes[0];
  const { act } = await import('@testing-library/react');
  act(() =>
    flow.props.onNodesChange([
      { type: 'dimensions', id: node.id, dimensions: { width: 270, height: 180 } },
    ])
  );
  expect(flow.props.nodes[0].measured).toEqual({ width: 270, height: 180 });
  act(() => flow.props.onNodeDragStop({}, { ...node, position: { x: 810, y: 240 } }));
  expect(handlers.onPreview).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Save candidate' })).toBeDisabled();
  view.unmount();
  render(
    <SchemaDataEditor
      initialDefinition={definition}
      revisionKey="1"
      view="visual"
      layoutKey="positions-test"
      {...handlers}
    />
  );
  expect(flow.props.nodes[0].position).toEqual({ x: 810, y: 240 });
});
