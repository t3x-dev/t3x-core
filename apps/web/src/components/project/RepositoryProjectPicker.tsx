'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProjects } from '@/hooks/projects/useProjects';

export function RepositoryProjectPicker({
  id,
  label,
  value,
  onChange,
  editableOnly = false,
  disabled = false,
  selectClassName,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (id: string, label: string) => void;
  editableOnly?: boolean;
  disabled?: boolean;
  selectClassName?: string;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<{ id: string; label: string }>();
  const { projects, loading, error, refresh, hasMore, loadMore } = useProjects(
    20,
    undefined,
    'on-demand',
    { search, editableOnly }
  );
  const options = projects
    .filter((project) => !editableOnly || project.can_edit !== false)
    .map((project) => ({
      id: project.project_id,
      label: project.namespace ? `${project.namespace}/${project.name}` : project.name,
    }));

  return (
    <div className="grid min-w-0 gap-2 text-sm">
      <label htmlFor={id}>{label}</label>
      <Input
        aria-label="Search repositories"
        type="search"
        placeholder="Search repositories…"
        value={search}
        maxLength={200}
        disabled={disabled}
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.preventDefault();
        }}
      />
      <select
        id={id}
        className={selectClassName ?? 'max-w-full rounded-md border bg-background px-2 py-1.5'}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const option = options.find((item) => item.id === event.target.value);
          if (!option && event.target.value) return;
          setSelected(option);
          onChange(option?.id ?? '', option?.label ?? '');
        }}
      >
        <option value="">Choose a project</option>
        {value && !options.some((option) => option.id === value) && (
          <option value={value}>{selected?.id === value ? selected.label : value}</option>
        )}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {loading && <output>Loading projects…</output>}
      {error && (
        <div role="alert">
          {error}{' '}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || loading}
            onClick={() => void (hasMore ? loadMore() : refresh())}
          >
            Retry project list
          </Button>
        </div>
      )}
      {!error && !loading && !options.length && !hasMore && (
        <p className="text-muted-foreground">No matching projects.</p>
      )}
      {hasMore && !error && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || loading}
          onClick={() => void loadMore()}
        >
          Load more projects
        </Button>
      )}
    </div>
  );
}
