import { expect, it } from 'vitest';
import { createStatePresentation, resolvePresentationLink } from './statePresentation';

const png = {
  path: 'images/avatar.png',
  mediaType: 'image/png' as const,
  alt: 'Project mark',
  base64:
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0uoAAAAASUVORK5CYII=',
};
it('allows description without compulsory sections or empty image placeholders', () => {
  const { document } = createStatePresentation({ description: 'Author text' });
  expect(document).toMatchObject({
    description: 'Author text',
    resources: [],
    avatarPath: null,
    readme: '',
    tags: [],
  });
  expect(document).not.toHaveProperty('purpose');
});
it('hashes normalized resource/tag order deterministically and preserves source text', () => {
  const second = { ...png, path: 'diagram.png' };
  const a = createStatePresentation({
    description: '  authored\n',
    tags: ['custom', 'official', 'custom'],
    resources: [png, second],
  });
  const b = createStatePresentation({
    description: '  authored\n',
    tags: ['official', 'custom'],
    resources: [second, png],
  });
  expect(a).toEqual(b);
  expect(a.document.description).toBe('  authored\n');
  expect(createStatePresentation({ description: 'different' }).digest).not.toBe(a.digest);
});
it.each([
  '../avatar.png',
  'https://host/avatar.png',
  '/avatar.png',
  'images/%2e%2e/avatar.png',
])('rejects unsafe image path %s', (path) => {
  expect(() =>
    createStatePresentation({ description: '', resources: [{ ...png, path }] })
  ).toThrow();
});
it('rejects duplicate paths, missing avatar, wrong MIME, invalid base64 and absent alt text', () => {
  expect(() => createStatePresentation({ description: '', resources: [png, png] })).toThrow();
  expect(() => createStatePresentation({ description: '', avatarPath: 'missing.png' })).toThrow();
  for (const override of [
    { mediaType: 'image/jpeg' as const },
    { base64: 'not base64' },
    { alt: '' },
  ])
    expect(() =>
      createStatePresentation({ description: '', resources: [{ ...png, ...override }] })
    ).toThrow();
});
it('bounds Unicode text bytes and image bytes', () => {
  expect(() => createStatePresentation({ description: '字'.repeat(2000) })).toThrow();
  expect(() =>
    createStatePresentation({
      description: '',
      resources: [{ ...png, base64: Buffer.alloc(512 * 1024 + 1).toString('base64') }],
    })
  ).toThrow();
});
it('resolves bundled images and safe links without trusting markup, tags or remote images', () => {
  const { document } = createStatePresentation({
    description: '',
    readme: '<script>bad()</script>',
    resources: [png],
    avatarPath: png.path,
    tags: ['renderer:admin'],
  });
  expect(document.readme).toBe('<script>bad()</script>'); // Inert authored source; never HTML.
  expect(resolvePresentationLink('./images/avatar.png', document, true)?.kind).toBe('resource');
  expect(resolvePresentationLink('#usage', document)?.kind).toBe('anchor');
  expect(resolvePresentationLink('https://example.com/docs', document)?.kind).toBe('external');
  for (const link of [
    'javascript:alert(1)',
    'data:text/html,bad',
    '//host/x',
    '../secret',
    new URL('/path', 'https://example.test').href.replace('://', '://user:' + 'pass@'),
  ])
    expect(resolvePresentationLink(link, document)).toBeNull();
  expect(resolvePresentationLink('https://example.com/image.png', document, true)).toBeNull();
});
