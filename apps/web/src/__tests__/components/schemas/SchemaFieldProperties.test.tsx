// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import {
  SchemaFieldProperties,
  SchemaFieldValidation,
} from '@/components/schemas/SchemaDefinitionStructure';

function setup(initial: Record<string, unknown>) {
  const save = vi.fn();
  function Harness() {
    const [value, setValue] = useState(initial);
    const [error, setError] = useState<string>();
    return (
      <>
        <SchemaFieldValidation onValidationChange={setError}>
          <SchemaFieldProperties kind="slot" path="task/title" value={value} onChange={setValue} />
        </SchemaFieldValidation>
        <button disabled={!!error} onClick={() => save(value)} type="button">
          Save
        </button>
      </>
    );
  }
  render(<Harness />);
  return save;
}
it('reveals optional settings on request without inventing a value and keeps invalid JSON editable', () => {
  const save = setup({ type: 'string' });
  expect(screen.getByLabelText('Description for slot task/title')).toBeVisible();
  expect(screen.queryByLabelText('Default value for slot task/title')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Add setting'), { target: { value: 'default' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  expect(save).toHaveBeenLastCalledWith({ type: 'string' });
  fireEvent.change(screen.getByLabelText('Default value for slot task/title'), {
    target: { value: '{' },
  });
  expect(screen.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  expect(screen.getByLabelText('Default value for slot task/title')).toHaveValue('{');
  fireEvent.change(screen.getByLabelText('Default value for slot task/title'), {
    target: { value: '"Untitled"' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  expect(save).toHaveBeenLastCalledWith({ type: 'string', default: 'Untitled' });
});
it('shows configured false, zero and null values and preserves untouched attributes', () => {
  const initial = {
    type: 'object',
    default: null,
    minimum: 0,
    provenanceRequired: false,
    extension: { keep: true },
  };
  const save = setup(initial);
  expect(screen.getByLabelText('Default value for slot task/title')).toHaveValue('null');
  expect(screen.getByLabelText('Minimum value for slot task/title')).toHaveValue('0');
  expect(screen.getByLabelText('Require source evidence for slot task/title')).toHaveValue('false');
  fireEvent.change(screen.getByLabelText('Description for slot task/title'), {
    target: { value: 'Task title' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  expect(save).toHaveBeenLastCalledWith({ ...initial, description: 'Task title' });
  fireEvent.change(screen.getByLabelText('Default value for slot task/title'), {
    target: { value: '' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  expect(save.mock.lastCall?.[0]).not.toHaveProperty('default');
  expect(screen.getByLabelText('Add setting')).toHaveTextContent('Default value');
});
it('retains configured operation hints inside the advanced disclosure', () => {
  const initial = { type: 'string', yopsHint: { preferredOp: 'set', path: 'task', slot: 'title' } };
  const save = setup(initial);
  expect(screen.getByLabelText('Target path for YOps hint task/title')).not.toBeVisible();
  fireEvent.click(screen.getByText('Writing operation hints · configured'));
  expect(screen.getByLabelText('Target path for YOps hint task/title')).toHaveValue('task');
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  expect(save).toHaveBeenLastCalledWith(initial);
});
