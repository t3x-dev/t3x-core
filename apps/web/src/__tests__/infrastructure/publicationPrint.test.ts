// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { printPublication } from '@/infrastructure/export/publication';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.querySelectorAll('iframe').forEach((frame) => frame.remove());
});

it('prints a separate complete document and cleans up after the print dialog', async () => {
  const print = vi.fn();
  const target = new EventTarget();
  Object.assign(target, { print, focus: vi.fn() });
  vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockReturnValue(
    target as unknown as Window
  );
  const promise = printPublication('<!doctype html><html><body>完整版本</body></html>');
  const frame = document.querySelector('iframe')!;
  expect(frame.srcdoc).toContain('完整版本');
  frame.dispatchEvent(new Event('load'));
  await promise;
  expect(print).toHaveBeenCalledOnce();
  target.dispatchEvent(new Event('afterprint'));
  expect(document.querySelector('iframe')).toBeNull();
});

it('reports unavailable printing and removes the failed frame', async () => {
  vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockReturnValue(null);
  const promise = printPublication('<html></html>');
  const failure = expect(promise).rejects.toThrow('Print is unavailable');
  document.querySelector('iframe')!.dispatchEvent(new Event('load'));
  await failure;
  expect(document.querySelector('iframe')).toBeNull();
});
