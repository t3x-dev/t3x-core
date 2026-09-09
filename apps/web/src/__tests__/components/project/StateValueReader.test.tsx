// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { StateSemanticReader, StateValueReader } from '@/components/project/StateValueReader';

it('keeps false, null, empty and absent cells distinguishable', () => {
  render(
    <StateValueReader
      value={[
        { enabled: false, note: null },
        { enabled: true, extra: '' },
      ]}
    />
  );
  expect(screen.getByRole('table')).toBeVisible();
  expect(screen.getByText('false')).toBeVisible();
  expect(screen.getByText('null')).toBeVisible();
  expect(screen.getAllByTitle('Absent')).toHaveLength(2);
});
it('renders nested data without executing markup', () => {
  const { container } = render(
    <StateValueReader value={{ list: ['<script>alert(1)</script>'], empty: [] }} />
  );
  expect(container.querySelector('script')).toBeNull();
  expect(screen.getByText('<script>alert(1)</script>')).toBeVisible();
  expect(screen.getByText('Empty list')).toBeVisible();
});
it('reads actual named content sections without codec envelope fields', () => {
  render(<StateSemanticReader trees={[{ key: 'care', slots: { done: false }, children: [] }]} />);
  expect(screen.getByRole('heading', { name: 'care' })).toBeVisible();
  expect(screen.getByText('false')).toBeVisible();
  expect(screen.queryByText('slots')).toBeNull();
});
