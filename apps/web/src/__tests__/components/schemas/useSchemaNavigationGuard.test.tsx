// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useSchemaNavigationGuard } from '@/components/schemas/useSchemaNavigationGuard';

function Editor({
  save,
  leave,
  discard = vi.fn(),
  canSave = true,
}: {
  save: () => Promise<boolean>;
  leave: () => void;
  discard?: () => void;
  canSave?: boolean;
}) {
  const guard = useSchemaNavigationGuard({ dirty: true, canSave, save, discard });
  return (
    <>
      <button type="button" onClick={() => guard.requestNavigation(leave)}>
        Switch Workspace
      </button>
      <a
        href="/explore?view=browse"
        onClick={(event) => {
          event.preventDefault();
          leave();
        }}
      >
        Browse
      </a>
      {guard.dialog}
    </>
  );
}
afterEach(() => {
  Reflect.deleteProperty(window, 'navigation');
});
it('keeps edits and destination pending when saving fails, then retries successfully', async () => {
  const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
    leave = vi.fn();
  render(<Editor save={save} leave={leave} />);
  fireEvent.click(screen.getByRole('button', { name: 'Switch Workspace' }));
  expect(leave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save & continue' }));
  await screen.findByRole('alert');
  expect(leave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save & continue' }));
  await waitFor(() => expect(leave).toHaveBeenCalledOnce());
});
it('protects same-tab links and lets the user stay or discard', async () => {
  const leave = vi.fn(),
    discard = vi.fn(),
    save = vi.fn();
  render(<Editor save={save} leave={leave} discard={discard} />);
  fireEvent.click(screen.getByRole('link', { name: 'Browse' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stay here' }));
  expect(leave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('link', { name: 'Browse' }));
  fireEvent.click(screen.getByRole('button', { name: 'Discard & continue' }));
  await waitFor(() => expect(leave).toHaveBeenCalledOnce());
  expect(discard).toHaveBeenCalledOnce();
  expect(save).not.toHaveBeenCalled();
});
it('does not offer saving invalid or stale edits', () => {
  render(<Editor save={vi.fn()} leave={vi.fn()} canSave={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Switch Workspace' }));
  expect(screen.getByRole('button', { name: 'Save & continue' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Stay here' })).toBeEnabled();
});
it('cancels browser history traversal before resuming the exact destination', async () => {
  const navigation = Object.assign(new EventTarget(), { traverseTo: vi.fn() });
  Object.defineProperty(window, 'navigation', { configurable: true, value: navigation });
  render(<Editor save={vi.fn().mockResolvedValue(true)} leave={vi.fn()} />);
  const event = Object.assign(new Event('navigate', { cancelable: true }), {
    navigationType: 'traverse',
    destination: { key: 'previous-entry', url: 'http://localhost/other' },
  });
  // Dispatch through act so the dialog state is flushed.
  fireEvent(navigation, event);
  expect(event.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Save & continue' }));
  await waitFor(() => expect(navigation.traverseTo).toHaveBeenCalledWith('previous-entry'));
});
