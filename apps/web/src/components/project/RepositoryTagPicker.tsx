'use client';

import { ChevronDown, Search, Tags } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useProjects } from '@/hooks/projects/useProjects';
import palette from '@/styles/management-palette.module.css';
import { cn } from '@/utils/cn';
import styles from './RepositoryControls.module.css';
import { RepositoryTag } from './RepositoryIdentity';

type TagOption = { name: string; count: number };
export function repositoryTagOptions(
  projects: readonly { repository_profile?: { tags: string[] } }[]
): TagOption[] {
  const counts = new Map<string, number>();
  for (const project of projects)
    for (const tag of new Set(project.repository_profile?.tags ?? []))
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

type ChoicesProps = {
  selected: string[];
  onChange: (tags: string[]) => void;
  query: string;
  maxSelected?: number;
};
function TagChoices({
  options,
  selected,
  onChange,
  query,
  maxSelected,
}: ChoicesProps & { options: TagOption[] }) {
  const visible = options.filter((option) =>
    option.name.toLowerCase().includes(query.trim().toLowerCase())
  );
  if (!visible.length)
    return (
      <p className={styles.panelEmpty}>
        {query ? 'No matching tags.' : 'No existing tags in this namespace yet.'}
      </p>
    );
  return (
    <fieldset aria-label="Available tags" className={styles.tagOptions}>
      {visible.map(({ name, count }) => (
        <label className={styles.tagOption} key={name}>
          <input
            type="checkbox"
            aria-label={name}
            checked={selected.includes(name)}
            disabled={
              !selected.includes(name) &&
              maxSelected !== undefined &&
              selected.length >= maxSelected
            }
            onChange={() =>
              onChange(
                selected.includes(name)
                  ? selected.filter((tag) => tag !== name)
                  : [...selected, name]
              )
            }
          />
          <RepositoryTag name={name} />
          <span title={`${count} repositories`}>{count}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function NamespaceTagChoices({ namespace, ...props }: ChoicesProps & { namespace: string }) {
  const { projects, loading, error, refresh } = useProjects(100, namespace, true);
  if (loading) return <output className={styles.panelEmpty}>Loading tags…</output>;
  if (error)
    return (
      <div role="alert" className={styles.panelError}>
        Couldn&apos;t load tags.{' '}
        <Button variant="outline" onClick={() => void refresh()}>
          Retry
        </Button>
      </div>
    );
  return <TagChoices {...props} options={repositoryTagOptions(projects)} />;
}

export function RepositoryTagPicker({
  selected,
  onChange,
  options = [],
  namespace,
  disabled,
  className,
}: {
  selected: string[];
  onChange: (tags: string[]) => void;
  options?: TagOption[];
  namespace?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const editing = namespace !== undefined;
  const label = editing ? 'Choose existing tags' : 'Filter by tags';
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={label}
          disabled={disabled}
          className={cn(styles.tagTrigger, className)}
        >
          <Tags aria-hidden="true" size={16} />
          {editing ? 'Choose existing' : selected.length ? 'Tags' : 'All tags'}
          {!editing && selected.length > 0 && (
            <span className={styles.tagCount}>{selected.length}</span>
          )}
          <ChevronDown aria-hidden="true" size={14} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label={label} className={cn(palette.scope, styles.tagPanel)}>
        <div className={styles.panelHeader}>
          <h3>{editing ? 'Existing tags' : 'Filter by tags'}</h3>
          <button type="button" disabled={!selected.length} onClick={() => onChange([])}>
            Clear tags
          </button>
        </div>
        <div className={styles.panelSearch}>
          <Search aria-hidden="true" size={16} />
          <Input
            type="search"
            aria-label="Search tags"
            placeholder="Search tags…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {open &&
          (editing ? (
            <NamespaceTagChoices
              key={namespace}
              namespace={namespace}
              selected={selected}
              onChange={onChange}
              query={query}
              maxSelected={32}
            />
          ) : (
            <TagChoices selected={selected} onChange={onChange} query={query} options={options} />
          ))}
        <div className={styles.panelFooter}>
          <span>
            {editing ? 'Choose tags or add your own below.' : 'Matches any selected tag.'}
          </span>
          <span>{selected.length} selected</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
