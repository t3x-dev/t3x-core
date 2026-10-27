import { type AnyDB, findMaterialsByIds } from '@t3x-dev/storage';
import type { ProtocolValue } from '@t3x-dev/transition';
import type { ProvenanceIndex } from '@t3x-dev/yschema';

function leafPaths(value: ProtocolValue, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return prefix ? [prefix] : [];
  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}/${key}` : key)
  );
}

/** Shared Review/preparation resolver. Client-provided provenance never grants evidence authority. */
export async function workspaceProvenance(
  db: AnyDB,
  projectId: string,
  workspace: Record<string, unknown>,
  tree: ProtocolValue
): Promise<ProvenanceIndex> {
  const requested = (Array.isArray(workspace.sourceBundle) ? workspace.sourceBundle : []).flatMap(
    (source) => {
      if (!source || typeof source !== 'object' || Array.isArray(source)) return [];
      const entry = source as Record<string, unknown>;
      return typeof entry.materialId === 'string' && entry.materialId.trim()
        ? [{ materialId: entry.materialId.trim(), hash: entry.contentHash }]
        : [];
    }
  );
  if (!requested.length) return {};
  const materials = await findMaterialsByIds(db, [
    ...new Set(requested.map((source) => source.materialId)),
  ]);
  const refs = requested.flatMap((source) => {
    const material = materials.find((item) => item.id === source.materialId);
    if (
      material?.project_id !== projectId ||
      (typeof source.hash === 'string' && source.hash !== material.content_hash)
    )
      return [];
    return [
      {
        origin: 'user_evidence' as const,
        sourceId: `material:${material.id}@${material.content_hash}`,
      },
    ];
  });
  const unique = [...new Map(refs.map((ref) => [ref.sourceId, ref])).values()].sort((a, b) =>
    a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0
  );
  if (!unique.length) return {};
  return Object.fromEntries(
    leafPaths(tree).map((path) => [path, unique.map((ref) => ({ ...ref }))])
  );
}
