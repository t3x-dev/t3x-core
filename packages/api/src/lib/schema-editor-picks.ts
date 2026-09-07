import { SchemaCatalogItemSchema } from '@t3x-dev/api-client';
import { type AnyDB, listYSchemaCatalogReleases } from '@t3x-dev/storage';

/** Reviewed editorial order. Pin content; never infer endorsement from tags or popularity. */
export const schemaEditorPicks = [
  {
    canonicalName: 't3x/compose-services',
    version: '1.0.0',
    hash: 'sha256:2750edbbd2c7d98cc02560cebda602cb6fbcee66f29a03712424ec17629a51b6',
    reason: 'Make a small service stack readable before you ship it.',
    editor: 'T3X',
    selectedAt: '2026-09-07',
  },
  {
    canonicalName: 't3x/care-checklist',
    version: '1.0.0',
    hash: 'sha256:d116a9d814f24905a565e5ca57af8340365d1d510a14d530faac9df51ff61c00',
    reason: 'Turn an everyday routine into a reusable, reviewable checklist.',
    editor: 'T3X',
    selectedAt: '2026-09-07',
  },
  {
    canonicalName: 't3x/product-brief',
    version: '1.0.0',
    hash: 'sha256:785bb29841292b8d259af14b2deb3ece0a600228710b0b4df81dd4bf39a18a11',
    reason: 'Connect each requirement to a concrete acceptance criterion.',
    editor: 'T3X',
    selectedAt: '2026-09-07',
  },
] as const;

export async function readSchemaEditorPicks(db: AnyDB, limit = 12) {
  const items = [];
  for (const pick of schemaEditorPicks.slice(0, 12)) {
    if (items.length >= Math.min(limit, 12)) break;
    // Public visibility and lifecycle are filtered in storage, even for signed-in viewers.
    const page = await listYSchemaCatalogReleases(db, {
      canonical_name: pick.canonicalName,
      exact_version: pick.version,
      exact_hash: pick.hash,
      limit: 1,
    });
    const item = page.items[0];
    if (item)
      items.push(
        SchemaCatalogItemSchema.parse({
          ...item,
          editorial: {
            reason: pick.reason,
            editor: pick.editor,
            selectedAt: pick.selectedAt,
          },
        })
      );
  }
  return { items, next_cursor: null, has_more: false };
}
