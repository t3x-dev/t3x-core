import { createHash } from 'node:crypto';

export interface StatePresentationInput {
  description: string;
  readme?: string;
  tags?: string[];
  avatarPath?: string;
  resources?: Array<{
    path: string;
    mediaType: 'image/png' | 'image/jpeg' | 'image/webp';
    alt: string;
    base64: string;
  }>;
}
const MAX_IMAGE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const sha256 = (bytes: string | Buffer) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function isPresentationResourcePath(path: string): boolean {
  return path.length <= 200 && /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(png|jpe?g|webp)$/.test(path);
}

/** Author content is inert, separately hashed, and never inserted into State.value. */
export function createStatePresentation(input: StatePresentationInput) {
  if (
    Buffer.byteLength(input.description) > 4096 ||
    Buffer.byteLength(input.readme ?? '') > 128 * 1024
  )
    throw new Error('Author text exceeds presentation limits');
  if ((input.tags?.length ?? 0) > 32 || input.tags?.some((tag) => !tag.trim() || tag.length > 64))
    throw new Error('Invalid presentation tags');
  if ((input.resources?.length ?? 0) > 16) throw new Error('Too many presentation images');
  let total = 0;
  const paths = new Set<string>();
  const resources = (input.resources ?? [])
    .map((resource) => {
      if (!isPresentationResourcePath(resource.path) || paths.has(resource.path))
        throw new Error('Invalid or duplicate image path');
      paths.add(resource.path);
      if (!resource.alt.trim() || resource.alt.length > 512)
        throw new Error('Image alt text is required');
      if (resource.base64.length > 700_000) throw new Error('Oversized image encoding');
      const bytes = Buffer.from(resource.base64, 'base64');
      if (
        bytes.length === 0 ||
        bytes.length > MAX_IMAGE_BYTES ||
        bytes.toString('base64') !== resource.base64
      )
        throw new Error('Invalid or oversized image encoding');
      total += bytes.length;
      if (total > MAX_TOTAL_BYTES) throw new Error('Presentation images exceed total size limit');
      const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const webp =
        bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
      const valid =
        resource.mediaType === 'image/png'
          ? png && resource.path.endsWith('.png')
          : resource.mediaType === 'image/jpeg'
            ? jpeg && /\.jpe?g$/.test(resource.path)
            : resource.mediaType === 'image/webp' && webp && resource.path.endsWith('.webp');
      if (!valid) throw new Error('Image bytes, path and media type must agree');
      return {
        path: resource.path,
        mediaType: resource.mediaType,
        alt: resource.alt,
        base64: resource.base64,
        byteLength: bytes.length,
        digest: sha256(bytes),
      };
    })
    .sort((a, b) => compare(a.path, b.path));
  if (input.avatarPath && !paths.has(input.avatarPath))
    throw new Error('Avatar must refer to an included image');
  const document = {
    schema: 't3x.dev/state-presentation/v1' as const,
    description: input.description,
    readme: input.readme ?? '',
    tags: [...new Set(input.tags ?? [])].sort(compare),
    avatarPath: input.avatarPath ?? null,
    resources,
  };
  return { digest: sha256(JSON.stringify(document)), document };
}
export type StatePresentation = ReturnType<typeof createStatePresentation>;

/** Consumers must disable raw HTML. Only bundled images have immutable provenance. */
export function resolvePresentationLink(
  href: string,
  document: StatePresentation['document'],
  image = false
) {
  const resource = document.resources.find(
    (item) => item.path === href || `./${item.path}` === href
  );
  if (resource) return { kind: 'resource' as const, path: resource.path, digest: resource.digest };
  if (image) return null;
  if (/^#[a-zA-Z0-9_-]+$/.test(href)) return { kind: 'anchor' as const, href };
  try {
    const url = new URL(href);
    if (url.protocol === 'https:' && !url.username && !url.password)
      return { kind: 'external' as const, href: url.href };
  } catch {
    /* Unresolved relative links are inert. */
  }
  return null;
}
