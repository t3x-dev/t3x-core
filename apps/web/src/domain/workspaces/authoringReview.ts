import type { SemanticContent } from '@t3x-dev/core';

export function authoringSemanticContent(value: unknown): SemanticContent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const document = value as Record<string, unknown>;
  if (document.domain !== 't3x.dev/semantic-content') return null;
  const content = document.content;
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
  const semantic = content as Record<string, unknown>;
  if (!Array.isArray(semantic.trees) || !Array.isArray(semantic.relations)) return null;
  return { trees: semantic.trees, relations: semantic.relations } as SemanticContent;
}

export function authoringSemanticPath(path: string): string | null {
  if (!path.startsWith('content/trees/')) return null;
  const keys = [...path.matchAll(/\[key=(?:"([^"]+)"|([^\]]+))\]/g)].map(
    (match) => match[1] ?? match[2]
  );
  const slot = path.match(/\/slots\/(.+)$/)?.[1];
  if (slot) keys.push(slot.replace(/^"|"$/g, ''));
  return keys.length ? keys.join('/') : null;
}
