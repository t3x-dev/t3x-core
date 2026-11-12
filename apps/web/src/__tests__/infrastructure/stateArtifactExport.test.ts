// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { exportArtifactCard } from '@/infrastructure/export/stateArtifact';

it('embeds the preview theme in standalone HTML', async () => {
  const card = document.createElement('article');
  const theme = document.createElement('style');
  theme.textContent = 'article { --text-primary: rebeccapurple; --surface-panel: linen; }';
  document.head.append(theme);
  document.body.append(card);

  const blob = await exportArtifactCard(
    card,
    'article { color: var(--text-primary); }',
    'State',
    'html'
  );
  const htmlText = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
  const html = new DOMParser().parseFromString(htmlText, 'text/html');

  expect(html.querySelector('article')?.style.getPropertyValue('--text-primary')).toBe(
    'rebeccapurple'
  );
  expect(html.body.style.background).toBe('linen');
});
