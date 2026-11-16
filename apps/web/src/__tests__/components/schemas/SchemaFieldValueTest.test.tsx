// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { SchemaFieldValueTest } from '@/components/schemas/SchemaFieldValueTest';

it('recomputes after a rule edit and clears the sample when the field changes', () => {
  const view = render(
    <SchemaFieldValueTest
      key="notes"
      definition={{ type: 'string', minLength: 5, maxLength: 80 }}
      required
      path="event/notes"
    />
  );
  fireEvent.change(screen.getByLabelText('Sample value'), { target: { value: 'four' } });
  fireEvent.click(screen.getByRole('button', { name: 'Test value' }));
  expect(screen.getByText('Field rules failed')).toBeVisible();
  view.rerender(
    <SchemaFieldValueTest
      key="notes"
      definition={{ type: 'string', minLength: 4, maxLength: 80 }}
      required
      path="event/notes"
    />
  );
  expect(screen.getByText('Field rules passed')).toBeVisible();
  view.rerender(
    <SchemaFieldValueTest key="title" definition={{ type: 'string' }} required path="event/title" />
  );
  expect(screen.queryByText('Field rules passed')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Sample value')).toHaveValue('');
});
it('keeps missing and null explicit and does not imply complete-context validation', () => {
  render(<SchemaFieldValueTest definition={{ type: 'string' }} required path="event/notes" />);
  fireEvent.change(screen.getByLabelText('Input type'), { target: { value: 'missing' } });
  fireEvent.click(screen.getByRole('button', { name: 'Test value' }));
  expect(screen.getByText('Field rules failed')).toBeVisible();
  expect(screen.getByText('No value is provided.')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Input type'), { target: { value: 'null' } });
  expect(screen.queryByText('Field rules failed')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Test value' }));
  expect(screen.getByText('Field rules failed')).toBeVisible();
  expect(screen.getByText(/whole-object checks run in Workspace/)).toBeVisible();
});
