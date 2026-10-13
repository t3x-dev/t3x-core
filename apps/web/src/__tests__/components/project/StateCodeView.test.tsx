// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { StateCodeView } from '@/components/project/StateCodeView';

const writeText = vi.fn();
const props = {
  branch: 'main',
  rootKey: 'service',
  commitHash: 'sha256:old',
  yamlText: 'service:\n  image: app:v1\n  date: 2026-09-05\n  enabled: true\n',
};
beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
});
it('copies exact YAML in YAML and Raw, and JSON without converting date strings', async () => {
  render(<StateCodeView {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy YAML code' }));
  await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(props.yamlText));
  fireEvent.click(screen.getByRole('button', { name: 'JSON', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Copy JSON code' }));
  await waitFor(() =>
    expect(JSON.parse(writeText.mock.calls.at(-1)![0])).toEqual({
      service: { image: 'app:v1', date: '2026-09-05', enabled: true },
    })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Raw', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Copy YAML code' }));
  await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(props.yamlText));
  expect(screen.queryByText('Valid Schema')).not.toBeInTheDocument();
});
it('searches selected source and follows explicit revision updates', async () => {
  const view = render(<StateCodeView {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Find in code' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Find in code' }), {
    target: { value: 'app:v1' },
  });
  expect(screen.getByText('1 matching lines')).toBeVisible();
  view.rerender(<StateCodeView {...props} commitHash="sha256:new" yamlText="service: app:v2" />);
  expect(screen.getByText('0 matching lines')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Copy YAML code' }));
  await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('service: app:v2'));
});
it('keeps malformed YAML visible rather than exporting a synthetic JSON error object', () => {
  render(<StateCodeView {...props} yamlText="bad: [" />);
  fireEvent.click(screen.getByRole('button', { name: 'JSON', exact: true }));
  expect(screen.getByRole('alert')).toHaveTextContent('cannot be represented as JSON');
  expect(screen.getByRole('button', { name: 'Copy JSON code' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Raw', exact: true }));
  expect(screen.getByText('bad: [')).toBeVisible();
});
it('reports clipboard denial and renders source markup as text', async () => {
  writeText.mockRejectedValue(new Error('denied'));
  const { container } = render(
    <StateCodeView {...props} yamlText={'value: "<img src=x onerror=alert(1)>"'} />
  );
  expect(container.querySelector('img')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Copy YAML code' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Clipboard unavailable');
});

it('derives source metadata from the selected format and navigates between matching lines', () => {
  const scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  render(
    <StateCodeView
      {...props}
      yamlText={'first: 中文\nsecond: 中文'}
      schemaName="test/schema"
      workspaceHref="/workspace"
    />
  );
  const info = screen.getByRole('complementary', { name: 'Source information' });
  expect(within(info).getByText('2')).toBeInTheDocument();
  expect(within(info).getByText('28 B')).toBeInTheDocument();
  expect(within(info).getByText('test/schema')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Find in code' }), {
    target: { value: '中文' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
  expect(screen.getByText('2 of 2')).toBeInTheDocument();
  expect(scrollIntoView).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'JSON', exact: true }));
  expect(within(info).getByText('JSON')).toBeInTheDocument();
  expect(within(info).getByText('4')).toBeInTheDocument();
  expect(within(info).getByRole('link', { name: 'Propose change' })).toHaveAttribute(
    'href',
    '/workspace'
  );
});
