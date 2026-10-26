'use client';

import { CircleHelp, Layers, Pencil } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getProjectIdHistoryPath, getProjectIdRepoPath } from '@/domain/project/repoPath';
import {
  type SchemaNodeProvenance,
  schemaSourceKey,
  schemaSourceReleaseHref,
} from '@/domain/schemas/schemaProvenance';
import type { SchemaSourceIdentity } from '@/hooks/schemas/useSchemaSourceIdentities';
import styles from './SchemaSourceBadge.module.css';

export function SchemaSourceBadge({
  path,
  provenance,
  identities,
}: {
  path: string;
  provenance: SchemaNodeProvenance;
  identities: Record<string, SchemaSourceIdentity>;
}) {
  const [failedImage, setFailedImage] = useState<string>();
  const first = provenance.sources[0];
  const identity = first?.pin ? identities[schemaSourceKey(first.pin)] : undefined;
  const multiple = provenance.sources.length > 1;
  const label = provenance.pending
    ? 'Checking source'
    : multiple
      ? `${provenance.sources.length} sources${provenance.local ? ' + local edits' : ''}`
      : first
        ? `${identity?.name ?? first.name} @ ${first.version}${provenance.local ? ' + local edits' : ''}`
        : provenance.local
          ? 'Local edit'
          : 'Source not recorded';
  const logo = identity?.logo;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`${styles.badge} nodrag nopan`}
          aria-label={`Source for ${path}: ${label}`}
          title={label}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {multiple ? (
            <Layers aria-hidden="true" />
          ) : logo && failedImage !== logo ? (
            <Image
              src={logo}
              width={22}
              height={22}
              alt=""
              unoptimized
              onError={() => setFailedImage(logo)}
            />
          ) : first ? (
            <span aria-hidden="true">
              {Array.from((identity?.name ?? first.name).split('/').at(-1) || '?')
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </span>
          ) : provenance.local ? (
            <Pencil aria-hidden="true" />
          ) : (
            <CircleHelp aria-hidden="true" />
          )}
          {first && provenance.local ? (
            <span className={styles.modified} aria-hidden="true">
              •
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={styles.details}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <h3>Node source</h3>
        <code>{path}</code>
        {provenance.pending ? <p>Checking sources for this definition…</p> : null}
        {provenance.sources.map((source) => {
          const info = source.pin ? identities[schemaSourceKey(source.pin)] : undefined;
          const projectId = source.commitRef?.projectId ?? info?.projectId ?? source.pin?.projectId;
          return (
            <section key={source.key} className={styles.source}>
              <strong>{info?.name ?? source.name}</strong>
              <span>
                {source.name} · {source.version}
              </span>
              {source.pin ? <code>{source.pin.hash}</code> : null}
              {source.commitRef ? (
                <div className={styles.links}>
                  <Link
                    href={getProjectIdHistoryPath(source.commitRef.projectId, {
                      commit: source.commitRef.commitDigest,
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View source Commit ↗
                  </Link>
                  <code>{source.commitRef.sourcePath}</code>
                </div>
              ) : null}
              {info?.unavailable ? (
                <p>Source unavailable or access restricted.</p>
              ) : source.pin ? (
                <div className={styles.links}>
                  <Link
                    href={schemaSourceReleaseHref(source.pin)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View exact release ↗
                  </Link>
                  {projectId ? (
                    <Link
                      href={getProjectIdRepoPath(projectId)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Source project ↗
                    </Link>
                  ) : null}
                </div>
              ) : !source.commitRef ? (
                <p>The exact source identity is unavailable.</p>
              ) : null}
            </section>
          );
        })}
        {provenance.local ? (
          <p>
            {first ? 'Includes local changes to this definition.' : 'Created or changed locally.'}
          </p>
        ) : null}
        {provenance.unknown ? (
          <p>
            {first
              ? 'Some source details are unavailable.'
              : 'No reliable source was recorded for this node.'}
          </p>
        ) : null}
        {!provenance.pending && first && !provenance.sources.some((source) => source.commitRef) ? (
          <p className={styles.note}>Original Commit link unavailable for this source.</p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
