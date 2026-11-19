// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import {
  SchemaFieldProperties,
  SchemaFieldValidation,
} from '@/components/schemas/SchemaDefinitionStructure';

function setup(initial: Record<string, unknown>, studio = false) {
  const save = vi.fn();
  function Harness() {
    const [value, setValue] = useState(initial);
    const [error, setError] = useState<string>();
    return (
      <>
        <SchemaFieldValidation onValidationChange={setError}>
          <SchemaFieldProperties
            kind="slot"
            path="task/title"
            value={value}
            onChange={setValue}
            studio={studio}
            ruleTest={studio ? <div data-testid="value-test">Try a sample</div> : undefined}
          />
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
  fireEvent.change(screen.getByLabelText('Add a setting'), { target: { value: 'default' } });
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
  expect(screen.getByLabelText('Default value for slot task/title')).not.toBeVisible();
  fireEvent.click(screen.getByText('Advanced settings · 1'));
  expect(screen.getByLabelText('Default value for slot task/title')).toHaveValue('null');
  expect(screen.getByLabelText('Number ≥ for slot task/title')).toHaveValue('0');
  expect(screen.getByLabelText('Require supporting evidence for slot task/title')).toHaveValue(
    'false'
  );
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
  expect(screen.getByLabelText('Add a setting')).toHaveTextContent('Default value');
});
it('retains configured operation hints inside the advanced disclosure', () => {
  const initial = { type: 'string', yopsHint: { preferredOp: 'set', path: 'task', slot: 'title' } };
  const save = setup(initial);
  expect(screen.getByLabelText('Target path for YOps hint task/title')).not.toBeVisible();
  fireEvent.click(screen.getByText('Advanced settings · 1'));
  expect(screen.getByLabelText('Target path for YOps hint task/title')).toHaveValue('task');
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  expect(save).toHaveBeenLastCalledWith(initial);
});

it('groups Studio rule creation beside validation and keeps lower-frequency settings in Advanced', () => {
  const initial = { type: 'string', minLength: 5, default: 'Untitled' };
  const save = setup(initial, true);
  const rules = screen.getByRole('region', { name: 'Validation rules' });
  const addRule = within(rules).getByLabelText('Add rule');
  expect(within(addRule).getByRole('option', { name: 'Allowed values' })).toBeVisible();
  expect(within(addRule).queryByRole('option', { name: 'Default value' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Add a setting')).not.toBeVisible();
  const trial = screen.getByTestId('value-test');
  const advanced = screen.getByText('Advanced settings · 1').closest('details')!;
  expect(rules.compareDocumentPosition(trial) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(trial.compareDocumentPosition(advanced) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(screen.getByText('Advanced settings · 1'));
  const settings = screen.getByLabelText('Add a setting');
  expect(settings).toBeVisible();
  expect(within(settings).getByRole('option', { name: 'Format hint' })).toBeVisible();
  expect(within(settings).queryByRole('option', { name: 'Length ≤' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  expect(save).toHaveBeenLastCalledWith(initial);
});

it('preserves invalid Studio rule input and blocks saving without exposing unrelated advanced settings', () => {
  setup({ type: 'string', default: 'Untitled' }, true);
  fireEvent.change(screen.getByLabelText('Add rule'), { target: { value: 'enum' } });
  fireEvent.change(screen.getByLabelText('Allowed values for slot task/title'), {
    target: { value: '[' },
  });
  expect(screen.getByLabelText('Allowed values for slot task/title')).toHaveValue('[');
  expect(screen.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  expect(screen.getByLabelText('Default value for slot task/title')).not.toBeVisible();
});
