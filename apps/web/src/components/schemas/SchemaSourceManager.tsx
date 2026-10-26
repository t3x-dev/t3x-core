'use client';

import type { StudioCandidate, StudioPreview } from '@t3x-dev/api-client';
import { MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ReferenceIcon as Icon } from './DiscoverReference';
import s from './SchemaStudioExperience.module.css';

type SourceOption = {
  id: string;
  title: string;
  source: string;
  checked: boolean;
  candidate?: StudioCandidate;
};

export function SchemaSourceManager({
  open,
  onOpenChange,
  browseHref,
  modules,
  composition,
  onChoose,
  onRemove,
  locked,
  pending,
  contextLocked,
  loading,
  error,
  data,
  onAdd,
  onClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  browseHref: string;
  modules: SourceOption[];
  composition: SourceOption[];
  onChoose: (module: SourceOption) => void;
  onRemove: (id: string) => void;
  locked: Set<string>;
  pending: boolean;
  contextLocked: boolean;
  loading: boolean;
  error?: string;
  data?: StudioPreview;
  onAdd?: () => void;
  onClear?: () => void;
}) {
  const [query, setQuery] = useState('');
  const visibleModules = modules.filter((module) =>
    `${module.title} ${module.source}`.toLowerCase().includes(query.toLowerCase())
  );
  function moduleIcon(module: SourceOption) {
    return (
      <span className={s.mi}>
        <Icon name={module.candidate?.kind === 'schema' ? 'braces' : 'box'} size={15} />
      </span>
    );
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Manage sources" title="Manage sources">
          <MoreHorizontal size={16} aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[65vh] w-[min(560px,calc(100vw-32px))] overflow-y-auto"
        aria-label="Manage Schema sources"
      >
        <p className="mb-3 text-sm font-medium">Sources · {composition.length} selected</p>
        <div className={s.sourceToolbar}>
          <input
            aria-label="Filter sources"
            placeholder="Search sources…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              onAdd?.();
            }}
            disabled={!onAdd || contextLocked || pending}
          >
            Combine sources…
          </Button>
          <Link href={browseHref} className={s.navLink}>
            Browse source releases
          </Link>
        </div>
        <ul className={s.sourceList}>
          {visibleModules.map((module) => {
            const dependencies =
              data?.modules.find((item) => item.candidateId === module.id)?.requiredBy ?? [];
            return (
              <li key={module.id} className={s.sourceRow}>
                <label className={s.sourceIdentity}>
                  <input
                    type="checkbox"
                    aria-label={
                      module.candidate
                        ? `Select ${module.title} ${module.candidate.source?.version ?? ''}`
                        : module.title
                    }
                    checked={module.checked}
                    disabled={
                      !module.candidate?.available ||
                      pending ||
                      contextLocked ||
                      locked.has(module.id)
                    }
                    onChange={() => onChoose?.(module)}
                  />
                  {moduleIcon(module)}
                  <span>
                    <b>{module.title}</b>
                    <small>
                      {module.candidate?.source?.canonicalName ?? module.source} ·{' '}
                      {module.candidate?.source?.version ?? 'Unavailable'}
                    </small>
                  </span>
                </label>
                <div className={s.sourceMetadata}>
                  <code>{module.candidate?.source?.hash ?? 'Hash unavailable'}</code>
                  {dependencies.length ? <span>Required by {dependencies.join(', ')}</span> : null}
                </div>
                {module.candidate ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${module.title}`}
                    disabled={pending || contextLocked || locked.has(module.id)}
                    onClick={() => onRemove?.(module.id)}
                  >
                    Remove
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {!loading && !error && !modules.length ? (
          <p className={s.feedback}>
            No sources yet. Browse schemas to add a definition or module.
          </p>
        ) : modules.length && !visibleModules.length ? (
          <p className={s.feedback}>No sources match this search.</p>
        ) : null}
        {composition.length && onClear ? (
          <Button variant="ghost" size="sm" disabled={pending || contextLocked} onClick={onClear}>
            Clear selection
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
