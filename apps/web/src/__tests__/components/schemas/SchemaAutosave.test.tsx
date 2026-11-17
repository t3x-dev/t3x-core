// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SchemaDataEditor } from '@/components/schemas/SchemaDataEditor';
import { SchemaYamlEditor } from '@/components/schemas/SchemaYamlEditor';
import type { SchemaSaveState } from '@/types/schemas';
import { deferred } from '../../hooks/deferred';

vi.mock('@/hooks/schemas/useStudioPreview', () => ({ useStudioPreview: () => ({}) }));
vi.mock('@/components/workspaces/WorkspaceYOpsEditor', () => ({
  WorkspaceYOpsEditor: ({
    value,
    onChange,
    ariaLabel,
    readOnly,
  }: {
    value: string;
    onChange: (value: string) => void;
    ariaLabel: string;
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
const initial = { yschema: '0.1', nodes: { item: { slots: { title: { type: 'string' } } } } };
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
});
const tick = async (ms = 800) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
function setup(
  save: ReturnType<typeof vi.fn>,
  options: { loading?: boolean; previewError?: string; autoSavePaused?: boolean } = {}
) {
  function Harness() {
    const [revision, setRevision] = useState('r1');
    const [status, setStatus] = useState<SchemaSaveState>({ status: 'idle' });
    return (
      <>
        <SchemaDataEditor
          autoSave
          workbenchFooter
          loading={false}
          {...options}
          revisionKey={revision}
          initialDefinition={initial}
          onSaveStateChange={setStatus}
          onDirtyChange={() => {}}
          onDiscard={() => {}}
          onPreview={() => {}}
          onSave={async (definition, intent, mappings) => {
            const next = await save(definition, intent, mappings);
            setRevision(next);
            return { revisionKey: next };
          }}
        />
        <output data-testid="status">{status.status}</output>
      </>
    );
  }
  const view = render(<Harness />);
  fireEvent.focus(screen.getByLabelText('Name item/title'));
  return {
    ...view,
    change: (value: string) =>
      fireEvent.change(screen.getByLabelText('Description for slot item/title'), {
        target: { value },
      }),
  };
}
it('debounces edits and serializes a newer value typed while the previous snapshot is saving', async () => {
  const first = deferred<string>();
  const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue('r3');
  const { change } = setup(save);
  change('one');
  await tick(400);
  change('two');
  await tick(400);
  expect(save).not.toHaveBeenCalled();
  await tick(400);
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('status')).toHaveTextContent('saving');
  change('three');
  await tick(1600);
  expect(save).toHaveBeenCalledTimes(1);
  await act(async () => first.resolve('r2'));
  expect(screen.getByLabelText('Description for slot item/title')).toHaveValue('three');
  expect(screen.getByTestId('status')).toHaveTextContent('unsaved');
  await tick();
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[0][0].nodes.item.slots.title.description).toBe('two');
  expect(save.mock.calls[1][0].nodes.item.slots.title.description).toBe('three');
  expect(screen.getByTestId('status')).toHaveTextContent('saved');
});
it('retains failed input, stops retrying in the background and allows an explicit retry', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue('r2');
  const { change } = setup(save);
  change('keep');
  await tick();
  expect(screen.getByTestId('status')).toHaveTextContent('failed');
  change('keep newest');
  await tick(5000);
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Description for slot item/title')).toHaveValue('keep newest');
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Save draft', exact: true }))
  );
  expect(save).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId('status')).toHaveTextContent('saved');
});
it('keeps a pending save guarded when the user undoes it, then saves the reverted value', async () => {
  const first = deferred<string>();
  const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue('r3');
  const { change } = setup(save);
  change('pending snapshot');
  await tick();
  fireEvent.click(screen.getByRole('button', { name: 'Undo', exact: true }));
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  await act(async () => first.resolve('r2'));
  expect(screen.getByLabelText('Description for slot item/title')).toHaveValue('');
  expect(screen.getByTestId('status')).toHaveTextContent('unsaved');
  await tick();
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1][0].nodes.item.slots.title.description).toBeUndefined();
});
it('does not replace an acknowledged snapshot with the old preview during refresh', async () => {
  const save = vi.fn().mockResolvedValue({ revisionKey: 'r2' });
  const props = {
    autoSave: true,
    workbenchFooter: true,
    initialDefinition: initial,
    onSave: save,
    onDirtyChange: vi.fn(),
    onDiscard: vi.fn(),
    onPreview: vi.fn(),
  };
  const view = render(<SchemaDataEditor {...props} loading={false} revisionKey="r1" />);
  fireEvent.focus(screen.getByLabelText('Name item/title'));
  fireEvent.change(screen.getByLabelText('Description for slot item/title'), {
    target: { value: 'saved text' },
  });
  await tick();
  view.rerender(<SchemaDataEditor {...props} loading revisionKey="loading" />);
  expect(screen.getByLabelText('Description for slot item/title')).toHaveValue('saved text');
  view.rerender(<SchemaDataEditor {...props} loading={false} revisionKey="r2" />);
  expect(screen.getByLabelText('Description for slot item/title')).toHaveValue('saved text');
  expect(save).toHaveBeenCalledTimes(1);
});
it('pauses automatic saving while source checks are unresolved', async () => {
  const save = vi.fn();
  const { change } = setup(save, { autoSavePaused: true });
  change('kept locally');
  await tick(2000);
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByTestId('status')).toHaveTextContent('unsaved');
});
it('does not save invalid input or a failed preview, and cancels the timer on unmount', async () => {
  const save = vi.fn().mockResolvedValue('r2');
  const view = setup(save, { previewError: 'Unresolved source conflict' });
  view.change('edit');
  await tick();
  expect(save).not.toHaveBeenCalled();
  view.unmount();
  const next = setup(save);
  fireEvent.change(screen.getByLabelText('Name item/title'), { target: { value: 'Bad Name' } });
  await tick();
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Name item/title'), { target: { value: 'title' } });
  next.change('pending');
  next.unmount();
  await tick();
  expect(save).not.toHaveBeenCalled();
});
it('keeps navigation and discard from dropping a snapshot while it is saving', async () => {
  const wait = deferred<string>();
  const save = vi.fn().mockReturnValue(wait.promise);
  const { change } = setup(save);
  change('pending');
  await tick();
  const link = document.createElement('a');
  link.href = '/another';
  link.textContent = 'Leave';
  document.body.append(link);
  fireEvent.click(link);
  expect(screen.getByRole('dialog', { name: 'Save schema draft before leaving?' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Discard & continue' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save & continue' })).toBeDisabled();
  link.remove();
  await act(async () => wait.resolve('r2'));
});
it('autosaves YAML snapshots without acknowledging newer text or opening Review', async () => {
  const first = deferred<void>();
  const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
  const review = vi.fn();
  render(
    <SchemaYamlEditor
      open
      autoSave
      workspaceTitle="main"
      initialDefinition={initial}
      onOpenChange={() => {}}
      onSave={save}
      onReview={review}
    />
  );
  const input = screen.getByLabelText('Schema definition YAML editor');
  const change = (value: string) => fireEvent.change(input, { target: { value } });
  change(
    "yschema: '0.1'\nname: example\nnodes:\n  item:\n    slots:\n      title: {type: string, description: first}"
  );
  await tick();
  expect(input).not.toHaveAttribute('readonly');
  change(
    "yschema: '0.1'\nname: example\nnodes:\n  item:\n    slots:\n      title: {type: string, description: second}"
  );
  await tick();
  expect(save).toHaveBeenCalledTimes(1);
  await act(async () => first.resolve());
  expect(screen.getByText('Unsaved changes')).toBeVisible();
  await tick();
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1][0].nodes.item.slots.title.description).toBe('second');
  expect(review).not.toHaveBeenCalled();
});

it('does not dirty or save a Schema when trying a local sample value', async () => {
  const save = vi.fn();
  setup(save);
  fireEvent.click(screen.getByText('Test a value', { exact: true }));
  fireEvent.change(screen.getByLabelText('Sample value'), { target: { value: 'sample' } });
  fireEvent.click(screen.getByRole('button', { name: 'Test value' }));
  expect(screen.getByText('Field rules passed')).toBeVisible();
  await tick(2000);
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByTestId('status')).toHaveTextContent('idle');
});

it('keeps valid YAML local until source checks allow automatic saving', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const props = {
    open: true,
    autoSave: true,
    workspaceTitle: 'main',
    initialDefinition: initial,
    onOpenChange: vi.fn(),
    onSave: save,
    onReview: vi.fn(),
  };
  const view = render(<SchemaYamlEditor {...props} autoSavePaused />);
  fireEvent.change(screen.getByLabelText('Schema definition YAML editor'), {
    target: { value: "yschema: '0.1'\nname: example\nnodes: {item: {}}" },
  });
  await tick(2000);
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByText('Unsaved · resolve Schema checks')).toBeVisible();
  view.rerender(<SchemaYamlEditor {...props} autoSavePaused={false} />);
  await tick();
  expect(save).toHaveBeenCalledTimes(1);
});
