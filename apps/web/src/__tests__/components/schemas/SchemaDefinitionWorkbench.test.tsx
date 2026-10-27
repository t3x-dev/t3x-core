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
  // The dialog footer survives editor updates. Reuse its control rather than
  // recomputing accessible names across every (including collapsed) field.
  const saveButton = screen.getByRole('button', { name: 'Save edits' });
  const change = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  const saved = () => {
    fireEvent.click(saveButton);
    return save.mock.lastCall?.[0] as Record<string, unknown>;
  };
  return { ...view, change, saved, save, preview };
}

describe('Schema YAML workbench', () => {
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
    const yaml = screen.getByLabelText('Schema definition YAML editor') as HTMLTextAreaElement;
    change(
      'Schema definition YAML editor',
      yaml.value.replace('type: string', 'type: string\n        minLength: 3')
    );
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
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

  it('saves advanced YAML settings and rejects malformed YAML', () => {
    const { change, saved, save, preview } = setup();
    const yaml = screen.getByLabelText('Schema definition YAML editor') as HTMLTextAreaElement;
    expect(screen.queryByRole('tab', { name: 'Structure' })).not.toBeInTheDocument();
    change(
      'Schema definition YAML editor',
      `${yaml.value}rules:
  - id: documented
    description: Human review
`
    );
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(preview).toHaveBeenCalledTimes(1);
    expect(saved()).toMatchObject({ rules: [{ id: 'documented', description: 'Human review' }] });
    save.mockClear();
    change('Schema definition YAML editor', 'nodes: [');
    saved();
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeVisible();
  });
});
