import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SourceBundleItem, WorkspaceSourceArtifact } from '@/types/workspaces';
import { WORKSPACE_SOURCE_ARTIFACT_FORMAT } from '@/types/workspaces';

export function SourceArtifactRoleEditor({
  artifact,
  materialId,
  onChange,
  source,
}: {
  artifact: WorkspaceSourceArtifact | undefined;
  materialId: string;
  onChange?: (artifact: WorkspaceSourceArtifact | undefined) => void;
  source: SourceBundleItem;
}) {
  const isRoot = artifact?.root?.materialId === materialId;
  const resource = artifact?.resources.find((item) => item.materialId === materialId);
  const defaultPath = source.fileName?.trim() || 'device.yaml';
  const [portablePath, setPortablePath] = useState(
    isRoot ? artifact.rootPath : (resource?.path ?? defaultPath)
  );

  const normalizedPath = normalizePortableSourcePath(portablePath);
  const duplicatePath =
    artifact?.resources.some(
      (item) => item.materialId !== materialId && item.path === normalizedPath
    ) ||
    (!isRoot && artifact?.rootPath === normalizedPath);
  const roleDisabled = !onChange || !normalizedPath || duplicatePath;

  const useAsRoot = () => {
    if (!onChange || !normalizedPath) return;
    onChange({
      format: WORKSPACE_SOURCE_ARTIFACT_FORMAT,
      rootPath: normalizedPath,
      root: {
        materialId,
        ...(source.contentHash ? { contentHash: source.contentHash } : {}),
      },
      resources: (artifact?.resources ?? []).filter(
        (item) => item.materialId !== materialId && item.path !== normalizedPath
      ),
    });
  };

  const useAsResource = () => {
    if (!onChange || !artifact?.root || !normalizedPath || duplicatePath) return;
    onChange({
      ...artifact,
      resources: [
        ...artifact.resources.filter((item) => item.materialId !== materialId),
        {
          path: normalizedPath,
          materialId,
          ...(source.contentHash ? { contentHash: source.contentHash } : {}),
        },
      ],
    });
  };

  const removeRole = () => {
    if (!onChange || !artifact) return;
    if (isRoot) {
      onChange(undefined);
      return;
    }
    onChange({
      ...artifact,
      resources: artifact.resources.filter((item) => item.materialId !== materialId),
    });
  };

  const updateRolePath = () => {
    if (!onChange || !artifact || !normalizedPath || duplicatePath) return;
    if (isRoot) {
      onChange({ ...artifact, rootPath: normalizedPath });
      return;
    }
    onChange({
      ...artifact,
      resources: artifact.resources.map((item) =>
        item.materialId === materialId ? { ...item, path: normalizedPath } : item
      ),
    });
  };

  return (
    <section
      aria-label="ESPHome configuration role"
      className="border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-3"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">
              ESPHome configuration role
            </h4>
            {isRoot ? <Badge variant="success">Root configuration</Badge> : null}
            {resource ? <Badge variant="outline">Local resource</Badge> : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            T3X stores this Material selection and path. The server re-resolves the exact bytes
            whenever checks or a decision run.
          </p>
        </div>
        <label className="grid min-w-56 gap-1 text-xs font-semibold text-[var(--text-secondary)]">
          Portable path
          <input
            className="h-9 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--source)]"
            onChange={(event) => setPortablePath(event.target.value)}
            placeholder="device.yaml"
            value={portablePath}
          />
        </label>
      </div>
      {duplicatePath ? (
        <p className="mt-2 text-xs text-[var(--status-error)]" role="alert">
          Another local resource already uses this path.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {isRoot || resource ? (
          <>
            <Button disabled={roleDisabled} onClick={updateRolePath} type="button" variant="commit">
              Update path
            </Button>
            <Button onClick={removeRole} type="button" variant="canvas-outline">
              Remove configuration role
            </Button>
          </>
        ) : null}
        {!isRoot ? (
          <Button disabled={roleDisabled} onClick={useAsRoot} type="button" variant="commit">
            Use as root configuration
          </Button>
        ) : null}
        {!isRoot && !resource ? (
          <Button
            disabled={roleDisabled || !artifact?.root}
            onClick={useAsResource}
            title={artifact?.root ? undefined : 'Choose a root configuration first.'}
            type="button"
            variant="canvas-outline"
          >
            Add as local resource
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function normalizePortableSourcePath(value: string): string {
  const normalized = value.trim().replaceAll('\\', '/').replace(/^\.\//, '');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    normalized.split('/').some((segment) => segment === '.' || segment === '..' || !segment)
  ) {
    return '';
  }
  return normalized;
}
