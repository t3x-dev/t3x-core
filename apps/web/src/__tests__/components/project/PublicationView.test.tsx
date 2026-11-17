// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PublicationView } from '@/components/project/PublicationView';
import { publicationStyles } from '@/components/project/publicationStyles';
import type { PublicationSource } from '@/domain/project/publication';
import { publicationHtml } from '@/infrastructure/export/publication';

const source: PublicationSource = {
  project: '计划 <script>bad()</script>',
  projectId: 'project-a',
  branch: 'main',
  stage: 'Saved Draft',
  subject: 'Content',
  version: 'workspace-a · Workspace r9',
  value: {
    rows: [
      {
        title: '会议',
        time: '13:00',
        done: false,
        body: '<img src=x onerror=bad()>',
        more: ['a', null, false],
      },
    ],
  },
};
const fields = {
  collection: '/rows',
  title: '/title',
  time: '/time',
  done: '/done',
  body: '/body',
};

describe('Publication UI and standalone document', () => {
  it.each([
    'schedule',
    'checklist',
    'brief',
  ] as const)('renders the %s layout and retains safely escaped full content in HTML', (layout) => {
    const { container } = render(
      <PublicationView source={source} initialConfig={{ layout, fields }} />
    );
    expect(screen.getByText('会议')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Copy version link' })).toBeNull();
    const article = container.querySelector('article');
    expect(article).not.toBeNull();
    const html = publicationHtml(article!, publicationStyles, source.project);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelectorAll('script,img,iframe')).toHaveLength(0);
    expect(doc.querySelector('meta[http-equiv="Content-Security-Policy"]')).not.toBeNull();
    expect(doc.querySelector('article')?.getAttribute('data-layout')).toBe(layout);
    expect(JSON.parse(doc.querySelector('details:last-of-type code')?.textContent ?? '')).toEqual(
      source.value
    );
    expect(doc.body.textContent).toContain('Workspace r9');
    expect(doc.body.textContent).toContain('Saved Draft');
  });
  it('requires field mapping and offers general reading without guessing', () => {
    render(<PublicationView source={source} />);
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(
      screen.getByText('Choose the fields for this layout, or use general reading.')
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'HTML' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Collection' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Use general reading' }));
    expect(screen.getByRole('button', { name: 'HTML' })).toBeEnabled();
  });
  it('shows missing fixed Review data as unavailable and disables exports', () => {
    render(<PublicationView source={{ ...source, stage: 'Fixed Review', value: undefined }} />);
    expect(screen.getByText('Fixed Review content is unavailable for this version.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'HTML' })).toBeDisabled();
    expect(screen.queryByRole('article')).toBeNull();
  });
  it('copies a committed version with layout and mapping, without a business write', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(
      <PublicationView
        source={{ ...source, stage: 'Committed State' }}
        commitHref="/team/repo/commits/42?view=structure"
        initialConfig={{ layout: 'brief', fields }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy version link' }));
    expect(await screen.findByText(/Version link copied/)).toBeVisible();
    const url = new URL(writeText.mock.calls[0][0]);
    expect(url.pathname).toBe('/team/repo/commits/42');
    expect(url.searchParams.get('layout')).toBe('brief');
    expect(JSON.parse(url.searchParams.get('fields')!)).toEqual(fields);
  });
});
