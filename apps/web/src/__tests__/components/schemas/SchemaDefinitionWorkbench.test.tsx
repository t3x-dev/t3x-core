// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SchemaDefinitionWorkbench } from '@/components/schemas/SchemaDefinitionWorkbench';

vi.mock('@/components/workspaces/WorkspaceYOpsEditor', () => ({
  WorkspaceYOpsEditor: ({
    ariaLabel,
    value,
    onChange,
  }: {
    ariaLabel: string;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const definition = {
  yschema: '0.1',
  name: 'team/example',
  version: '1.0',
  description: 'Frozen metadata',
  strict: true,
  nodes: {
    product: {
      required: true,
      requiredSlots: ['title'],
      slots: { title: { type: 'string' }, untouched: { type: 'boolean', default: false } },
    },
    requirements: { repeated: true, slots: {} },
  },
};

function setup(initial: Record<string, unknown> = structuredClone(definition)) {
  const save = vi.fn().mockResolvedValue(undefined);
  const preview = vi.fn();
  function Harness() {
    const [echo, setEcho] = useState(initial);
    return (
      <SchemaDefinitionWorkbench
        open
        onOpenChange={() => {}}
        baseSchema={initial}
        resultSchema={echo}
        initialDefinition={echo}
        onPreview={(value) => {
          preview(value);
          setEcho(value);
        }}
        onSave={save}
      />
    );
  }
  const view = render(<Harness />);
  const change = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  const saved = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save candidate' }));
    return save.mock.lastCall?.[0] as Record<string, unknown>;
  };
  return { ...view, change, saved, save, preview };
}

describe('complete Schema Structure settings', () => {
  it('previews only nodes as collapsible folders with inline Slot and node attribute tags', () => {
    setup({
      ...definition,
      nodes: {
        product: {
          required: true,
          children: { item: { repeated: true, slots: { count: { type: 'number', minimum: 0 } } } },
          requiredSlots: ['title'],
          slots: { title: { type: 'string', minLength: 1, default: '' } },
        },
      },
      rules: [{ kind: 'reserved', id: 'not-in-tree' }],
      relationTypes: { links: { from: 'product', to: 'product' } },
    });
    const base = screen.getByRole('region', { name: 'Base (immutable)' });
    const result = screen.getByRole('region', { name: 'Result preview' });
    const folder = within(base).getByRole('button', { name: 'Node product' });
    expect(folder).toHaveAttribute('aria-expanded', 'false');
    expect(within(folder).getByText('required')).toBeVisible();
    expect(within(base).queryByText('title')).not.toBeInTheDocument();
    for (const text of ['team/example', 'strict', 'rules', 'not-in-tree', 'links']) {
      expect(within(base).queryByText(text)).not.toBeInTheDocument();
    }
    fireEvent.click(folder);
    const slot = within(base).getByLabelText('Slot product/title');
    expect(slot).toHaveClass('whitespace-nowrap');
    for (const text of ['title', 'type: "string"', 'minLength: 1', 'default: ""', 'required']) {
      expect(within(slot).getByText(text)).toBeVisible();
    }
    const child = within(base).getByRole('button', { name: 'Node product/item' });
    expect(within(child).getByText('repeated')).toBeVisible();
    fireEvent.click(child);
    expect(within(base).getByText('minimum: 0')).toBeVisible();
    // Each preview has its own disclosure state and remains read-only.
    expect(within(result).getByRole('button', { name: 'Node product' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(within(base).queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(folder);
    expect(within(base).queryByLabelText('Slot product/title')).not.toBeInTheDocument();
  });

  it('refreshes Result tree tags after editing without changing the Base or losing expanded nodes', () => {
    const { change } = setup();
    const base = screen.getByRole('region', { name: 'Base (immutable)' });
    const result = screen.getByRole('region', { name: 'Result preview' });
    fireEvent.click(within(base).getByRole('button', { name: 'Node product' }));
    fireEvent.click(within(result).getByRole('button', { name: 'Node product' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand settings for slot product/title' }));
    change('minLength for slot product/title', '3');
    expect(within(result).getByText('minLength: 3')).toBeVisible();
    expect(within(base).queryByText('minLength: 3')).not.toBeInTheDocument();
    expect(within(result).getByRole('button', { name: 'Node product' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('distinguishes unavailable previews from schemas with no nodes', () => {
    render(
      <SchemaDefinitionWorkbench
        open
        onOpenChange={() => {}}
        resultSchema={{ nodes: {} }}
        onPreview={() => {}}
        onSave={async () => {}}
      />
    );
    expect(
      within(screen.getByRole('region', { name: 'Base (immutable)' })).getByText(
        'Preview unavailable'
      )
    ).toBeVisible();
    expect(
      within(screen.getByRole('region', { name: 'Result preview' })).getByText('No nodes defined')
    ).toBeVisible();
  });

  it('keeps a collapsed Slot in one header row with its name, type and delete action', () => {
    const { change } = setup();
    const slot = screen.getByRole('region', { name: 'Slot product/title' });
    const name = within(slot).getByLabelText('Slot name title');
    const type = within(slot).getByLabelText('Slot type title');
    const remove = within(slot).getByRole('button', { name: 'Remove slot title' });
    const header = remove.parentElement;
    expect(header).toHaveClass('grid');
    expect(header).toContainElement(name);
    expect(header).toContainElement(type);
    expect(header).not.toContainElement(
      within(slot).getByLabelText('required for slot product/title')
    );
    expect(within(slot).getByLabelText('required for slot product/title')).not.toBeVisible();
    fireEvent.click(
      within(slot).getByRole('button', { name: 'Expand settings for slot product/title' })
    );
    expect(within(slot).getByLabelText('required for slot product/title')).toBeVisible();
    change('default for slot product/title', '{');
    fireEvent.click(
      within(slot).getByRole('button', { name: 'Collapse settings for slot product/title' })
    );
    expect(name).toBeVisible();
    expect(type).toHaveValue('string');
    expect(remove).toBeVisible();
    expect(within(slot).getByLabelText('default for slot product/title')).not.toBeVisible();
    expect(screen.getByRole('button', { name: 'Save candidate' })).toBeDisabled();
    fireEvent.click(
      within(slot).getByRole('button', { name: 'Expand settings for slot product/title' })
    );
    expect(within(slot).getByLabelText('default for slot product/title')).toHaveValue('{');
    change('default for slot product/title', '"kept"');
    expect(screen.getByRole('button', { name: 'Save candidate' })).toBeEnabled();
  });

  it('moves node required/repeated into settings and collapses the whole node without losing values', () => {
    const { saved } = setup();
    const node = screen.getByRole('article', { name: 'Node product' });
    for (const key of ['required', 'repeated']) {
      const control = within(node).getByLabelText(`${key} for node product`);
      expect(control.closest('details')?.querySelector('summary')).toHaveTextContent(
        'Node settings'
      );
    }
    fireEvent.click(
      within(node).getByRole('button', { name: 'Collapse settings for node product' })
    );
    expect(within(node).getByLabelText('Node name product')).toBeVisible();
    expect(within(node).getByLabelText('Slot name title')).not.toBeVisible();
    expect(within(node).getByRole('button', { name: 'Remove node product' })).toBeVisible();
    fireEvent.click(within(node).getByRole('button', { name: 'Expand settings for node product' }));
    expect(within(node).getByLabelText('Slot name title')).toBeVisible();
    expect(saved()).toEqual(definition);
  });

  it.each([
    {
      title: 'node metadata',
      context: 'node product',
      values: {
        description: 'Product overview',
        contentGuidance: 'Explain the problem',
        contentKind: 'structured',
      },
      expected: {
        description: 'Product overview',
        contentGuidance: 'Explain the problem',
        contentKind: 'structured',
      },
    },
    {
      title: 'Slot content guidance',
      context: 'slot product/title',
      values: {
        description: 'Title description',
        contentGuidance: 'Be precise',
        contentKind: 'prose',
        provenanceRequired: 'true',
      },
      expected: {
        description: 'Title description',
        contentGuidance: 'Be precise',
        contentKind: 'prose',
        provenanceRequired: true,
      },
    },
    {
      title: 'Slot JSON values',
      context: 'slot product/title',
      values: {
        enum: '["alpha","beta"]',
        const: '"alpha"',
        default: '"alpha"',
        examples: '["alpha"]',
      },
      expected: { enum: ['alpha', 'beta'], const: 'alpha', default: 'alpha', examples: ['alpha'] },
    },
    {
      title: 'Slot numeric bounds',
      context: 'slot product/title',
      values: { minimum: '-2.5', maximum: '10', minLength: '0', maxLength: '80', maxWords: '20' },
      expected: { minimum: -2.5, maximum: 10, minLength: 0, maxLength: 80, maxWords: 20 },
    },
    {
      title: 'Slot string constraints',
      context: 'slot product/title',
      values: { pattern: '^[a-z]+$', format: 'slug', gapQuestion: 'What is the title?' },
      expected: { pattern: '^[a-z]+$', format: 'slug', gapQuestion: 'What is the title?' },
    },
    {
      title: 'YOps hints',
      context: 'YOps hint product/title',
      values: { preferredOp: 'populate', path: 'product', slot: 'title' },
      expected: { yopsHint: { preferredOp: 'populate', path: 'product', slot: 'title' } },
    },
  ])('edits $title without changing the Base or sibling fields', ({
    context,
    values,
    expected,
  }) => {
    const base = structuredClone(definition);
    const { change, saved } = setup(base);
    for (const [key, value] of Object.entries(values))
      change(key + ' for ' + context, value as string);
    const result = saved();
    expect(result).toMatchObject({
      yschema: '0.1',
      name: 'team/example',
      version: '1.0',
      description: 'Frozen metadata',
      strict: true,
      nodes: {
        product: {
          required: true,
          requiredSlots: ['title'],
          slots: { untouched: { type: 'boolean', default: false } },
        },
      },
    });
    const nodes = result.nodes as Record<string, Record<string, unknown>>;
    const product = nodes.product;
    const title = (product.slots as Record<string, Record<string, unknown>>).title;
    expect(context === 'node product' ? product : title).toMatchObject(expected);
    expect(base).toEqual(definition);
  });

  it.each([
    'null',
    'false',
    '0',
    '""',
    '{"a":[1,true,null]}',
  ])('retains explicit JSON value %s instead of removing it', (json) => {
    const { change, saved } = setup();
    change('default for slot product/title', json);
    expect(saved()).toMatchObject({
      nodes: { product: { slots: { title: { default: JSON.parse(json) } } } },
    });
  });

  it('removes optional values and empty hints without writing null or changing an unspecified type', () => {
    const initial = structuredClone(definition) as Record<string, unknown>;
    initial.nodes = {
      product: { slots: { title: { default: false, enum: ['a'], yopsHint: { path: 'product' } } } },
    };
    const { change, saved } = setup(initial);
    expect(screen.getByLabelText('Slot type title')).toHaveValue('');
    change('default for slot product/title', '');
    change('enum for slot product/title', '');
    change('path for YOps hint product/title', '');
    expect(saved()).toMatchObject({ nodes: { product: { slots: { title: {} } } } });
    const nodes = saved().nodes as Record<
      string,
      { slots: Record<string, Record<string, unknown>> }
    >;
    expect(nodes.product.slots.title).toEqual({});
  });

  it('blocks malformed JSON even when another field updates and preview echoes new props', () => {
    const { change, save, saved } = setup();
    change('default for slot product/title', '{');
    change('description for node product', 'Keep this edit');
    expect(screen.getByLabelText('default for slot product/title')).toHaveValue('{');
    expect(screen.getByRole('button', { name: 'Save candidate' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
    expect(screen.getByRole('tab', { name: 'YAML' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save candidate' }));
    expect(save).not.toHaveBeenCalled();
    change('default for slot product/title', 'false');
    expect(screen.getByRole('button', { name: 'Save candidate' })).toBeEnabled();
    expect(saved()).toMatchObject({
      nodes: { product: { description: 'Keep this edit', slots: { title: { default: false } } } },
    });
  });

  it.each([
    ['enum', '{}'],
    ['enum', '[]'],
    ['examples', 'false'],
    ['default', '1e400'],
    ['minimum', 'Infinity'],
    ['maxLength', '-1'],
    ['minLength', '1.5'],
    ['maxWords', '0'],
  ])('rejects invalid %s input %s', (key, value) => {
    const { change } = setup();
    change(`${key} for slot product/title`, value);
    expect(screen.getByRole('button', { name: 'Save candidate' })).toBeDisabled();
    change(`${key} for slot product/title`, '');
    expect(screen.getByRole('button', { name: 'Save candidate' })).toBeEnabled();
  });

  it('edits nested child nodes and synchronizes requiredSlots on rename and removal', () => {
    const { change, saved } = setup();
    change('Children mode product', 'defined');
    fireEvent.click(screen.getByRole('button', { name: 'Add child node' }));
    change('Node name product/new_node', 'details');
    fireEvent.blur(screen.getByLabelText('Node name product/new_node'));
    const child = screen.getByRole('article', { name: 'Node product/details' });
    fireEvent.click(within(child).getByRole('button', { name: 'Add Slot' }));
    change('Slot name new_slot', 'summary');
    fireEvent.blur(screen.getByLabelText('Slot name new_slot'));
    fireEvent.click(screen.getByLabelText('required for slot product/details/summary'));
    change('maxWords for slot product/details/summary', '30');
    change('Slot name title', 'heading');
    fireEvent.blur(screen.getByLabelText('Slot name title'));
    expect(saved()).toMatchObject({
      nodes: {
        product: {
          requiredSlots: ['heading'],
          children: {
            details: {
              requiredSlots: ['summary'],
              slots: { summary: { type: 'string', maxWords: 30 } },
            },
          },
        },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove slot heading' }));
    const result = saved().nodes as Record<string, Record<string, unknown>>;
    expect(result.product).not.toHaveProperty('requiredSlots');
    fireEvent.click(screen.getByRole('button', { name: 'Remove node product/details' }));
    expect(saved()).toMatchObject({ nodes: { product: { children: {} } } });
    change('Children mode product', 'any');
    expect(saved()).toMatchObject({ nodes: { product: { children: 'any' } } });
  });

  it('prevents duplicate/invalid names without overwriting nodes, Slots or rule IDs', () => {
    const { change, saved } = setup();
    change('Node name product', 'requirements');
    fireEvent.blur(screen.getByLabelText('Node name product'));
    expect(screen.getByRole('button', { name: 'Save candidate' })).toBeDisabled();
    change('Node name product', 'product');
    change('Slot name title', 'bad-key');
    fireEvent.blur(screen.getByLabelText('Slot name title'));
    expect(screen.getByRole('button', { name: 'Save candidate' })).toBeDisabled();
    change('Slot name title', 'untouched');
    fireEvent.blur(screen.getByLabelText('Slot name title'));
    expect(screen.getByRole('button', { name: 'Save candidate' })).toBeDisabled();
    change('Slot name title', 'title');
    expect(saved()).toEqual(definition);
  });

  it('adds, renames, edits and removes every relation setting', () => {
    const { change, saved } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add relation type' }));
    change('Relation type name new_relation', 'depends_on');
    fireEvent.blur(screen.getByLabelText('Relation type name new_relation'));
    for (const [key, value] of Object.entries({
      from: 'requirements/*',
      to: 'product',
      description: 'Depends on',
      contentGuidance: 'Record dependencies',
      acyclic: 'true',
    }))
      change(key + ' for relation depends_on', value);
    expect(saved()).toMatchObject({
      relationTypes: {
        depends_on: {
          from: 'requirements/*',
          to: 'product',
          description: 'Depends on',
          contentGuidance: 'Record dependencies',
          acyclic: true,
        },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove relation type depends_on' }));
    expect(saved().relationTypes).toEqual({});
  });

  it('edits required-relation rules while preserving reserved rules', () => {
    const { change, saved } = setup({
      ...structuredClone(definition),
      relationTypes: { depends_on: { from: 'requirements/*', to: 'product' } },
      rules: [{ id: 'reserved', description: 'Reserved for later' }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    change('Rule id new_rule', 'must_depend');
    fireEvent.blur(screen.getByLabelText('Rule id new_rule'));
    change('kind for rule must_depend', 'required_relation');
    change('relationType for rule must_depend', 'depends_on');
    change('from for rule must_depend', 'requirements/*');
    change('to for rule must_depend', 'product');
    change('description for rule must_depend', 'Every requirement needs a product');
    expect(saved().rules).toEqual([
      { id: 'reserved', description: 'Reserved for later' },
      {
        id: 'must_depend',
        kind: 'required_relation',
        relationType: 'depends_on',
        from: 'requirements/*',
        to: 'product',
        description: 'Every requirement needs a product',
      },
    ]);
    change('kind for rule must_depend', '');
    expect(saved().rules).toEqual([
      { id: 'reserved', description: 'Reserved for later' },
      { id: 'must_depend', description: 'Every requirement needs a product' },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove rule reserved' }));
    expect(saved().rules).toEqual([
      { id: 'must_depend', description: 'Every requirement needs a product' },
    ]);
  });

  it('round-trips advanced fields through YAML without losing settings', () => {
    const { change, saved } = setup();
    change('default for slot product/title', '"hello"');
    fireEvent.click(screen.getByRole('tab', { name: 'YAML' }));
    const yaml = screen.getByLabelText('Schema definition YAML editor');
    expect((yaml as HTMLTextAreaElement).value).toContain('default: hello');
    fireEvent.change(yaml, {
      target: {
        value: `${(yaml as HTMLTextAreaElement).value}\nrelationTypes: {}\nrules:\n  - id: documented\n    description: Human review\n`,
      },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Structure' }));
    expect(screen.getByLabelText('description for rule documented')).toHaveValue('Human review');
    expect(screen.getByLabelText('default for slot product/title')).toHaveValue('"hello"');
    expect(saved()).toMatchObject({ rules: [{ id: 'documented', description: 'Human review' }] });
  });

  it('clears validation errors when an invalid Slot is removed', () => {
    const { change } = setup();
    change('default for slot product/title', '{');
    expect(screen.getByRole('button', { name: 'Save candidate' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove slot title' }));
    expect(screen.getByRole('button', { name: 'Save candidate' })).toBeEnabled();
  });

  it('does not crash or silently rewrite invalid rule entries from a YAML draft', () => {
    const { saved } = setup({ ...structuredClone(definition), rules: [null] });
    expect(screen.getByRole('heading', { name: 'Rules' })).toBeInTheDocument();
    expect(saved().rules).toEqual([null]);
  });
});
