// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ComposeOperationStacks } from '@/components/workspaces/ComposeOperationStacks';

it('expands recorded operations into separate field-level set cards', () => {
  render(
    <ComposeOperationStacks
      stacks={[
        {
          name: 'append',
          path: 'requirements/children',
          items: [
            {
              actionId: 'a2',
              sequence: 2,
              index: 1,
              name: 'append',
              path: 'requirements/children',
              fields: [
                {
                  op: 'set',
                  path: 'requirements/children/[key=second]/slots/title',
                  after: 'Second',
                },
              ],
            },
            {
              actionId: 'a1',
              sequence: 1,
              index: 1,
              name: 'append',
              path: 'requirements/children',
              fields: [
                {
                  op: 'set',
                  path: 'requirements/children/[key=first]/slots/title',
                  after: 'First',
                },
                {
                  op: 'set',
                  path: 'requirements/children/[key=first]/slots/priority',
                  after: 'should',
                },
                {
                  op: 'set',
                  path: 'requirements/children/[key=first]/slots/acceptance',
                  after: 'Done',
                },
              ],
            },
          ],
        },
      ]}
    />
  );
  const group = screen.getByRole('region', { name: 'Recorded operation stacks' });
  const layers = group.querySelectorAll('details');
  expect(layers).toHaveLength(2);
  expect(layers[0]!.querySelector('summary')).toHaveTextContent('Second');
  expect(layers[0]!.querySelector('summary')).toHaveTextContent('title:');
  const layer = screen.getByText(/P-01 · YOp 1/).closest('details')!;
  expect(layer.querySelector('summary')).toHaveTextContent('First');
  expect(layer.querySelector('summary')).toHaveTextContent('priority:');
  fireEvent.click(screen.getByText(/P-01 · YOp 1/));
  const cards = layer.querySelectorAll('li');
  expect(cards).toHaveLength(3);
  expect([...cards].map((card) => card.querySelector('code')?.textContent)).toEqual([
    'title',
    'priority',
    'acceptance',
  ]);
  expect(cards[0]!.querySelector('code')).toHaveAttribute(
    'title',
    'requirements/children/[key=first]/slots/title'
  );
  expect([...cards].map((card) => card.textContent)).toEqual([
    expect.stringContaining('set'),
    expect.stringContaining('set'),
    expect.stringContaining('set'),
  ]);
  expect(group).not.toHaveTextContent('assert');
});
