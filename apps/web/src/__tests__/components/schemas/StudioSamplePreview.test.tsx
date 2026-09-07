// @vitest-environment jsdom
import '@testing-library/jest-dom';
import type { StudioPreview } from '@t3x-dev/api-client';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { StudioSamplePreview } from '@/components/schemas/StudioSamplePreview';

const check = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/schemas/useStudioPreview', () => ({ useValidateStudioSample: () => check }));
const preview = {
  selectionHash: 'selection',
  schemaHash: 'schema',
  schema: { nodes: { items: { repeated: true } } },
  samples: [
    {
      id: 'one',
      source: { canonicalName: 'team/checklist', version: '1', hash: 'source' },
      value: { items: { water: { task: 'Water', done: false } } },
      ready: true,
      valid: true,
      issues: [],
    },
  ],
} as unknown as StudioPreview;
it('invalidates a running validation after editing and resets edits for a new exact selection', async () => {
  let finish: (data: unknown) => void = () => {};
  check.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const { rerender } = render(
    <StudioSamplePreview
      key="one"
      projectId="p"
      candidateIds={['one']}
      preview={preview}
      xray={false}
    />
  );
  expect(screen.getByRole('table')).toHaveTextContent('Water');
  fireEvent.click(screen.getByRole('button', { name: 'Edit sample' }));
  fireEvent.change(screen.getByLabelText('Sample JSON'), { target: { value: '{"local":1}' } });
  fireEvent.click(screen.getByRole('button', { name: 'Validate sample' }));
  fireEvent.change(screen.getByLabelText('Sample JSON'), { target: { value: '{"local":2}' } });
  await act(async () => finish({ ...preview, localSample: { ready: true, issues: [] } }));
  expect(screen.getByLabelText('Sample validation')).toHaveTextContent('Not checked');
  rerender(
    <StudioSamplePreview
      key="two"
      projectId="p"
      candidateIds={['two']}
      preview={{ ...preview, selectionHash: 'new' }}
      xray={false}
    />
  );
  expect(screen.queryByLabelText('Sample JSON')).not.toBeInTheDocument();
  expect(screen.getByRole('table')).toHaveTextContent('Water');
  expect(screen.getByLabelText('Sample validation')).toHaveTextContent(
    'Matches selected definition'
  );
});

it('renders repeated nodes with primitive lists without dropping their values', () => {
  const services = {
    ...preview,
    schema: { nodes: { services: { repeated: true } } },
    samples: [
      {
        ...preview.samples[0],
        value: { services: { web: { image: 'nginx', ports: ['8080:80', '8443:443'] } } },
      },
    ],
  } as unknown as StudioPreview;
  render(
    <StudioSamplePreview projectId="p" candidateIds={['one']} preview={services} xray={false} />
  );
  expect(screen.getByRole('table')).toHaveTextContent('nginx');
  expect(screen.getByRole('table')).toHaveTextContent('8080:80');
  expect(screen.getByRole('table')).toHaveTextContent('8443:443');
});
