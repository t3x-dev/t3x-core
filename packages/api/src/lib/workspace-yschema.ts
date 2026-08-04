import {
  type AnyDB,
  findYSchemaArtifactVersion,
  findYSchemaCompositionSnapshot,
} from '@t3x-dev/storage';
import {
  builtInPrdCoreArtifact,
  builtInPrdModules,
  compileYSchemaComposition,
  normalizeYSchemaObject,
  sha256CompositionValue,
  type YSchema,
  type YSchemaCompositionDraft,
} from '@t3x-dev/yschema';
import {
  canonicalSchemaNameFromBinding,
  resolveBuiltInYSchema,
  schemaVersionFromBinding,
} from './yschema-registry';

export interface WorkspaceYSchemaResolution {
  canonicalName: string | null;
  schema: YSchema | null;
  version?: string;
}

/**
 * Resolve the exact contract bound to a Workspace. Composition bindings are
 * rebuilt from their immutable built-in artifact versions and accepted only
 * when both the manifest and compiled Schema hashes still match the binding.
 */
export async function resolveWorkspaceYSchema(
  workspace: Record<string, unknown>,
  db?: AnyDB,
  projectId?: string
): Promise<WorkspaceYSchemaResolution> {
  const bindings = Array.isArray(workspace.schemaBindings) ? workspace.schemaBindings : [];
  const binding = asRecord(bindings[0]);
  const compositionId = stringValue(binding?.compositionId);
  const compositionRevision = integerValue(binding?.compositionRevision);
  const expectedCompositionHash = stringValue(binding?.compositionHash);
  const expectedSchemaHash = stringValue(binding?.schemaHash);

  if (compositionId && compositionRevision !== null) {
    const version = `r${compositionRevision}`;
    if (db && projectId && expectedCompositionHash && expectedSchemaHash) {
      const snapshot = await findYSchemaCompositionSnapshot(db, {
        project_id: projectId,
        composition_id: compositionId,
        composition_revision: compositionRevision,
        compiled_schema_hash: expectedSchemaHash,
      });
      if (snapshot?.compositionHash === expectedCompositionHash) {
        const schema = normalizeYSchemaObject(snapshot.schemaJson);
        if ((await sha256CompositionValue(schema)) === expectedSchemaHash) {
          return { canonicalName: compositionId, schema, version };
        }
      }
    }

    const composition = asComposition(workspace.schemaComposition);
    if (
      !composition ||
      composition.id !== compositionId ||
      composition.revision !== compositionRevision ||
      !expectedCompositionHash ||
      !expectedSchemaHash
    ) {
      return { canonicalName: compositionId, schema: null, version };
    }

    const compiled = await compileYSchemaComposition({
      composition,
      core: builtInPrdCoreArtifact,
      modules: builtInPrdModules,
    });
    if (
      !compiled.report.valid ||
      compiled.compositionHash !== expectedCompositionHash ||
      compiled.compiledSchemaHash !== expectedSchemaHash
    ) {
      return { canonicalName: compositionId, schema: null, version };
    }
    return { canonicalName: compositionId, schema: compiled.schema, version };
  }

  const canonicalName = canonicalSchemaNameFromBinding(binding);
  const version = schemaVersionFromBinding(binding);
  const builtIn = canonicalName ? resolveBuiltInYSchema(canonicalName, version) : null;
  if (builtIn) return { canonicalName, schema: builtIn, ...(version ? { version } : {}) };

  if (db && canQueryYSchemaRegistry(db) && projectId && canonicalName && version) {
    const published = await findYSchemaArtifactVersion(db, {
      canonical_name: canonicalName,
      version,
      project_id: projectId,
    });
    const manifest = asRecord(published?.manifest);
    if (manifest?.apiVersion === 't3x.dev/yschema-core/v1' && manifest.schema) {
      const schema = normalizeYSchemaObject(manifest.schema);
      if (!expectedSchemaHash || (await sha256CompositionValue(schema)) === expectedSchemaHash) {
        return { canonicalName, schema, version };
      }
    }
  }
  return {
    canonicalName,
    schema: null,
    ...(version ? { version } : {}),
  };
}

function canQueryYSchemaRegistry(db: AnyDB): boolean {
  return typeof (db as AnyDB & { select?: unknown }).select === 'function';
}

function asComposition(value: unknown): YSchemaCompositionDraft | null {
  const record = asRecord(value);
  if (
    record?.apiVersion !== 't3x.dev/yschema-composition/v1' ||
    typeof record.id !== 'string' ||
    !Number.isInteger(record.revision) ||
    record.status !== 'draft' ||
    !asRecord(record.core) ||
    !Array.isArray(record.modules)
  ) {
    return null;
  }
  return value as YSchemaCompositionDraft;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function integerValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}
