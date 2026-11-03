// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SchemaYamlEditor } from '@/components/schemas/SchemaYamlEditor';

vi.mock('@/components/workspaces/WorkspaceYOpsEditor', () => ({
  WorkspaceYOpsEditor: ({
    ariaLabel,
    value,
    onChange,
    readOnly,
  }: {
    ariaLabel: string;
    value: string;
    onChange: (value: string) => void;
    readOnly: boolean;
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
const initial = {
  yschema: '0.1',
  name: 'example',
  nodes: { item: { slots: { title: { type: 'string' } } } },
};
function setup() {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onReview = vi.fn().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  const props = {
    open: true,
    onOpenChange,
    initialDefinition: initial,
    workspaceTitle: 'Main workspace',
    onSave,
    onReview,
  };
  const view = render(<SchemaYamlEditor {...props} />);
  const change = (value: string) =>
    fireEvent.change(screen.getByLabelText('Schema definition YAML editor'), { target: { value } });
  return { ...view, props, onSave, onReview, onOpenChange, change };
}
const edited =
  "yschema: '0.1'\nname: example\nnodes: {}\nrules:\n  - id: documented\n    description: Human review\n";

describe('Schema YAML editor', () => {
  it('saves advanced settings without closing and preserves input during parent refresh', async () => {
    const { change, onSave, onOpenChange, rerender, props } = setup();
    change(edited);
    fireEvent.click(screen.getByRole('button', { name: 'Save draft', exact: true }));
    await waitFor(() => expect(screen.getByText('Draft saved · not committed')).toBeVisible());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ rules: [{ id: 'documented', description: 'Human review' }] }),
      'Edit Schema YAML.'
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    change(`${edited}description: still editing\n`);
    rerender(<SchemaYamlEditor {...props} initialDefinition={{ nodes: {} }} />);
    expect(screen.getByLabelText('Schema definition YAML editor')).toHaveValue(
      `${edited}description: still editing\n`
    );
  });

  it.each([
    'nodes: [',
    '',
    'nodes: {}',
    'yschema: 0.1\nnodes: {}',
  ])('rejects invalid or incomplete YAML before either save action: %s', (source) => {
    const { change, onSave, onReview } = setup();
    change(source);
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save and review' })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
    expect(onReview).not.toHaveBeenCalled();
  });

  it('keeps failed saves editable and does not enter Review', async () => {
    const { change, onSave, onReview } = setup();
    onSave.mockRejectedValue(new Error('Revision conflict'));
    change(edited);
    fireEvent.click(screen.getByRole('button', { name: 'Save and review' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Revision conflict'));
    expect(screen.getByLabelText('Schema definition YAML editor')).toHaveValue(edited);
    expect(onReview).not.toHaveBeenCalled();
    expect(screen.getByText('Unsaved changes')).toBeVisible();
  });

  it('retries Review after successful save without resaving the same revision', async () => {
    const { change, onSave, onReview } = setup();
    onReview.mockRejectedValueOnce(new Error('Network error'));
    change(edited);
    fireEvent.click(screen.getByRole('button', { name: 'Save and review' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Saved. Could not open Review: Network error'
      )
    );
    expect(onSave).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Save and review' }));
    await waitFor(() => expect(onReview).toHaveBeenCalledTimes(2));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('guards close inline and allows retaining or discarding YAML changes', () => {
    const { change, onOpenChange } = setup();
    change(edited);
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Schema definition YAML editor')).toHaveValue(edited);
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard YAML edits' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('locks editing during save and prevents duplicate submissions', async () => {
    const { change, onSave } = setup();
    let finish!: () => void;
    onSave.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    change(edited);
    fireEvent.click(screen.getByRole('button', { name: 'Save draft', exact: true }));
    expect(screen.getByLabelText('Schema definition YAML editor')).toHaveAttribute('readonly');
    fireEvent.click(screen.getByRole('button', { name: 'Save and review' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(screen.getByText('Draft saved · not committed')).toBeVisible());
  });
});
