// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProjectSettingsNav } from '@/components/project/settings/ProjectSettingsNav';

afterEach(() => {
  delete document.documentElement.dataset.reducedMotion;
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

function renderSettings() {
  return render(
    <>
      <ProjectSettingsNav />
      <section id="general" tabIndex={-1}>
        General content
      </section>
      <section id="export" tabIndex={-1}>
        Export content
      </section>
      <section id="danger" tabIndex={-1}>
        Danger content
      </section>
    </>
  );
}

it('mobile section navigation preserves the route, focuses the destination, and respects reduced motion', async () => {
  window.history.replaceState(null, '', '/owner/repo/settings?returnTo=%2Fowner%2Frepo');
  document.documentElement.dataset.reducedMotion = 'true';
  renderSettings();
  const danger = document.getElementById('danger')!;
  const scroll = vi.fn();
  danger.scrollIntoView = scroll;

  fireEvent.change(screen.getByRole('combobox', { name: 'Settings section' }), {
    target: { value: 'danger' },
  });

  expect(scroll).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' });
  expect(danger).toHaveFocus();
  expect(window.location.pathname).toBe('/owner/repo/settings');
  expect(window.location.search).toBe('?returnTo=%2Fowner%2Frepo');
  expect(window.location.hash).toBe('#danger');
  await waitFor(() => expect(screen.queryByRole('option', { name: 'AI defaults' })).toBeNull());
});

it('keeps the final short section selected at the bottom instead of highlighting the previous section', async () => {
  renderSettings();
  vi.spyOn(document.getElementById('general')!, 'getBoundingClientRect').mockReturnValue({
    top: -1000,
    bottom: -500,
  } as DOMRect);
  vi.spyOn(document.getElementById('export')!, 'getBoundingClientRect').mockReturnValue({
    top: -100,
    bottom: 400,
  } as DOMRect);
  vi.spyOn(document.getElementById('danger')!, 'getBoundingClientRect').mockReturnValue({
    top: window.innerHeight - 200,
    bottom: window.innerHeight,
  } as DOMRect);
  fireEvent.scroll(document);

  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Settings section' })).toHaveValue('danger')
  );
  expect(screen.getByRole('link', { name: 'Danger zone' })).toHaveAttribute('aria-current', 'true');
});
