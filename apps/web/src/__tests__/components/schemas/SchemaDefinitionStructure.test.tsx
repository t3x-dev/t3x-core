// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SchemaDefinitionStructure } from '@/components/schemas/SchemaDefinitionStructure';

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

function setup(
  initial: Record<string, unknown> = structuredClone(definition),
  progressive = false
) {
  const save = vi.fn();
  function Harness() {
    const [value, setValue] = useState(initial);
    const [error, setError] = useState<string>();
    return (
      <>
        <SchemaDefinitionStructure
          progressive={progressive}
          value={value}
          onChange={setValue}
          onValidationChange={setError}
        />
        <button type="button" disabled={!!error} onClick={() => save(value)}>
          Save candidate
        </button>
      </>
    );
  }
  const view = render(<Harness />);
  const change = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  const saved = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save candidate' }));
    return save.mock.lastCall?.[0] as Record<string, unknown>;
  };
  return { ...view, change, saved, save };
}

describe('complete Schema Structure settings', () => {
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

  it('preserves a newly added nested node and required Slot when a parent Slot is renamed', () => {
    const { saved } = setup();
    const product = within(screen.getByRole('article', { name: 'Node product' }));
    fireEvent.click(product.getByText('Node settings', { selector: 'summary' }));
    fireEvent.change(product.getByLabelText('Children mode product'), {
      target: { value: 'defined' },
    });
    const children = within(product.getByRole('region', { name: 'Children of product' }));
    fireEvent.click(children.getByRole('button', { name: 'Add child node' }));
    const nodeName = children.getByLabelText('Node name product/new_node');
    fireEvent.change(nodeName, { target: { value: 'details' } });
    fireEvent.blur(nodeName);
    const child = within(children.getByRole('article', { name: 'Node product/details' }));
    fireEvent.click(child.getByRole('button', { name: 'Add Slot' }));
    const slotName = child.getByLabelText('Slot name new_slot');
    fireEvent.change(slotName, { target: { value: 'summary' } });
    fireEvent.blur(slotName);
    const slot = within(child.getByRole('region', { name: 'Slot product/details/summary' }));
    fireEvent.click(
      slot.getByRole('button', { name: 'Expand settings for slot product/details/summary' })
    );
    fireEvent.click(slot.getByLabelText('required for slot product/details/summary'));
    fireEvent.change(slot.getByLabelText('maxWords for slot product/details/summary'), {
      target: { value: '30' },
    });
    const parentSlotName = product.getByLabelText('Slot name title');
    fireEvent.change(parentSlotName, { target: { value: 'heading' } });
    fireEvent.blur(parentSlotName);
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
  });

  it('synchronizes requiredSlots when a required Slot is renamed and removed', () => {
    const { saved } = setup();
    const product = within(screen.getByRole('article', { name: 'Node product' }));
    const name = product.getByLabelText('Slot name title');
    fireEvent.change(name, { target: { value: 'heading' } });
    fireEvent.blur(name);
    const renamed = saved().nodes as Record<string, Record<string, unknown>>;
    expect(renamed.product.requiredSlots).toEqual(['heading']);
    expect(renamed.product.slots).toEqual({
      heading: { type: 'string' },
      untouched: { type: 'boolean', default: false },
    });
    fireEvent.click(product.getByRole('button', { name: 'Remove slot heading' }));
    const result = saved().nodes as Record<string, Record<string, unknown>>;
    expect(result.product).not.toHaveProperty('requiredSlots');
    expect(result.product.slots).toEqual({ untouched: { type: 'boolean', default: false } });
  });

  it('removes a nested child node and switches from defined to unrestricted children', () => {
    const { saved } = setup({
      ...structuredClone(definition),
      nodes: {
        product: {
          children: {
            details: {
              requiredSlots: ['summary'],
              slots: { summary: { type: 'string', maxWords: 30 } },
            },
          },
        },
      },
    });
    const product = within(screen.getByRole('article', { name: 'Node product' }));
    // The parent disclosure precedes its nested child's settings.
    fireEvent.click(product.getAllByText('Node settings', { selector: 'summary' })[0]);
    const child = within(product.getByRole('article', { name: 'Node product/details' }));
    fireEvent.click(child.getByRole('button', { name: 'Remove node product/details' }));
    expect(saved()).toMatchObject({ nodes: { product: { children: {} } } });
    expect(
      product.queryByRole('article', { name: 'Node product/details' })
    ).not.toBeInTheDocument();
    fireEvent.change(product.getByLabelText('Children mode product'), {
      target: { value: 'any' },
    });
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

it('keeps Schema-wide rules collapsed and preserves validation while their settings are hidden', () => {
  const { save, saved } = setup(
    {
      ...definition,
      relationTypes: { depends: { from: 'product', to: 'requirements' } },
      rules: [
        {
          id: 'connection',
          kind: 'required_relation',
          relationType: 'depends',
          from: 'product',
          to: 'requirements',
        },
      ],
    },
    true
  );
  const name = screen.getByLabelText('Relation type name depends');
  expect(name).not.toBeVisible();
  fireEvent.click(screen.getByText('depends', { selector: 'strong' }));
  expect(name).toBeVisible();
  fireEvent.change(name, { target: { value: 'invalid name' } });
  fireEvent.click(screen.getByText('depends', { selector: 'strong' }));
  expect(screen.getByRole('button', { name: 'Save candidate' })).toBeDisabled();
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('depends', { selector: 'strong' }));
  fireEvent.change(name, { target: { value: 'depends' } });
  expect(saved()).toHaveProperty('rules.0.relationType', 'depends');
});
