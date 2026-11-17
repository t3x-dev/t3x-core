'use client';

import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DEFAULT_PUBLICATION,
  PUBLICATION_LAYOUTS,
  type PublicationConfig,
  type PublicationFields,
  type PublicationSource,
  publicationAt,
  publicationEntries,
  publicationItems,
  publicationMappingIssue,
  publicationPaths,
  publicationText,
  publicationValue,
} from '@/domain/project/publication';
import { usePublicationExport } from '@/hooks/commits/usePublicationExport';
import { publicationStyles } from './publicationStyles';

const layoutNames = {
  generic: 'General',
  schedule: 'Schedule',
  checklist: 'Checklist',
  brief: 'Brief',
};

export function PublicationView({
  source,
  commitHref,
  initialConfig = DEFAULT_PUBLICATION,
  configError,
}: {
  source: PublicationSource;
  commitHref?: string;
  initialConfig?: PublicationConfig;
  configError?: string;
}) {
  const [config, setConfig] = useState(initialConfig);
  const [mappingOpen, setMappingOpen] = useState(() =>
    Boolean(publicationMappingIssue(publicationValue(source.value).value, initialConfig))
  );
  const article = useRef<HTMLElement>(null);
  const reading = useMemo(() => publicationValue(source.value), [source.value]);
  const collectionPaths = useMemo(() => publicationPaths(reading.value, true), [reading.value]);
  const items = publicationItems(reading.value, config);
  const fieldPaths = [...new Set(items.flatMap(([, item]) => publicationPaths(item)))];
  const issue = publicationMappingIssue(reading.value, config);
  const unavailable = source.value === undefined;
  const { feedback, printing, exportFile, share } = usePublicationExport(
    source,
    config,
    article,
    publicationStyles,
    commitHref
  );
  const roles: { key: keyof Omit<PublicationFields, 'collection'>; label: string }[] = [
    { key: 'title', label: 'Title' },
    ...(config.layout === 'schedule' ? [{ key: 'time' as const, label: 'Time' }] : []),
    ...(config.layout === 'checklist'
      ? [{ key: 'done' as const, label: 'Complete (boolean)' }]
      : []),
    { key: 'body', label: config.layout === 'brief' ? 'Body' : 'Body (optional)' },
  ];
  function setField(key: keyof PublicationFields, path: string | undefined) {
    setConfig((current) => ({
      ...current,
      fields:
        key === 'collection' ? { collection: path ?? '' } : { ...current.fields, [key]: path },
    }));
  }
  return (
    <section className="min-w-0 py-4" aria-label="Publication">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--stroke-divider)] pb-3">
        <fieldset className="flex flex-wrap gap-1" aria-label="Publication layout">
          {PUBLICATION_LAYOUTS.map((layout) => (
            <Button
              key={layout}
              size="sm"
              variant={config.layout === layout ? 'secondary' : 'ghost'}
              aria-pressed={config.layout === layout}
              onClick={() => {
                setConfig({ ...config, layout });
                setMappingOpen(
                  Boolean(publicationMappingIssue(reading.value, { ...config, layout }))
                );
              }}
            >
              {layoutNames[layout]}
            </Button>
          ))}
        </fieldset>
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={unavailable || Boolean(issue)}
            onClick={() => void exportFile('html')}
          >
            HTML
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={unavailable || Boolean(issue)}
            onClick={() => void exportFile('md')}
          >
            Markdown
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={unavailable || Boolean(issue) || printing}
            onClick={() => void exportFile('print')}
          >
            {printing ? 'Preparing…' : 'Print / PDF'}
          </Button>
          {source.stage === 'Committed State' && commitHref ? (
            <Button
              size="sm"
              variant="outline"
              disabled={unavailable || Boolean(issue)}
              onClick={() => void share()}
            >
              Copy version link
            </Button>
          ) : null}
        </div>
      </div>
      {configError ? (
        <p role="alert" className="py-2 text-sm">
          {configError}
        </p>
      ) : null}
      {feedback ? (
        <p role={feedback.error ? 'alert' : 'status'} className="py-2 text-sm">
          {feedback.text}
        </p>
      ) : null}
      {config.layout !== 'generic' && !unavailable ? (
        <details
          className="my-3 rounded-md border border-[var(--stroke-default)] p-3"
          open={mappingOpen}
          onToggle={(event) => setMappingOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer text-sm font-medium">Field mapping</summary>
          <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
            <div className="min-w-0">
              <span className="mb-1 block text-xs font-medium">Read as</span>
              <Select
                value={config.itemMode ?? 'collection'}
                onValueChange={(itemMode) =>
                  setConfig({
                    ...config,
                    itemMode: itemMode === 'single' ? 'single' : 'collection',
                  })
                }
              >
                <SelectTrigger aria-label="Read as" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="collection">Collection of items</SelectItem>
                  <SelectItem value="single">One whole item</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <FieldSelect
              label="Collection"
              paths={collectionPaths}
              value={config.fields.collection}
              onChange={(path) => setField('collection', path)}
            />
            {roles.map(({ key, label }) => (
              <FieldSelect
                key={key}
                label={label}
                paths={fieldPaths}
                value={config.fields[key]}
                onChange={(path) => setField(key, path)}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            Select a list or object, then fields within each item. Values keep their original order.
          </p>
        </details>
      ) : null}
      <style>{publicationStyles}</style>
      {unavailable ? (
        <output className="block py-8 text-sm">
          {source.stage} content is unavailable for this version.
        </output>
      ) : (
        <article ref={article} className="publication-document" data-layout={config.layout}>
          <header>
            <span className="pub-stage">{source.stage}</span>
            <h1>
              {source.project} · {source.subject}
            </h1>
            <p className="pub-meta">
              {source.branch} · {layoutNames[config.layout]}
            </p>
            <details>
              <summary>Version details</summary>
              <p>Project: {source.projectId}</p>
              <p>Version: {source.version}</p>
              <pre>{JSON.stringify(config, null, 2)}</pre>
            </details>
          </header>
          {issue ? (
            <div>
              <output>{issue}</output>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfig({ ...config, layout: 'generic' })}
              >
                Use general reading
              </Button>
            </div>
          ) : config.layout === 'generic' ? (
            <>
              <p className="pub-meta">
                {reading.projected
                  ? 'Content tree projection. Relations and the original envelope are in Complete content.'
                  : 'All fields in this version.'}
              </p>
              <PublicationValue value={reading.value} />
            </>
          ) : (
            <>
              <p className="pub-meta">
                {items.length} items · Mapped fields. All other fields are in Complete content.
              </p>
              <ol className={`pub-items pub-${config.layout}`}>
                {items.map(([key, item]) => {
                  const get = (field: keyof PublicationFields) =>
                    publicationAt(item, config.fields[field] ?? '');
                  const done = get('done');
                  return (
                    <li key={key} className="pub-item">
                      {config.layout === 'schedule' ? <p>{publicationText(get('time'))}</p> : null}
                      {config.layout === 'checklist' ? (
                        <span
                          className="pub-check"
                          role="img"
                          aria-label={
                            typeof done === 'boolean'
                              ? done
                                ? 'Complete'
                                : 'Open'
                              : 'Unknown completion'
                          }
                        >
                          {done === true ? '☑' : done === false ? '☐' : '?'}
                        </span>
                      ) : null}
                      <div>
                        <p className="pub-meta">Item {key}</p>
                        <h2>{publicationText(get('title'))}</h2>
                        {config.layout === 'checklist' && typeof done !== 'boolean' ? (
                          <p>Expected boolean: {publicationText(done)}</p>
                        ) : null}
                        {config.fields.body !== undefined ? (
                          <p>{publicationText(get('body'))}</p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
          <details>
            <summary>Complete content</summary>
            <pre>
              <code>{JSON.stringify(source.value, null, 2)}</code>
            </pre>
          </details>
          <footer>
            Reading copy · Repository access rules apply to online links. Downloaded files are
            independent copies.
          </footer>
        </article>
      )}
    </section>
  );
}

function FieldSelect({
  label,
  paths,
  value,
  onChange,
}: {
  label: string;
  paths: string[];
  value?: string;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-xs font-medium">{label}</span>
      <Select
        value={value === undefined ? 'unset' : `path:${value}`}
        onValueChange={(next) => onChange(next === 'unset' ? undefined : next.slice(5))}
      >
        <SelectTrigger aria-label={label} className="w-full min-w-0">
          <SelectValue placeholder="Choose field" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unset">Not selected</SelectItem>
          {[...new Set([...paths, ...(value === undefined ? [] : [value])])].map((path) => (
            <SelectItem key={path} value={`path:${path}`}>
              {path || 'Whole value'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function PublicationValue({ value }: { value: unknown }) {
  if (value === null || typeof value !== 'object') return <p>{publicationText(value)}</p>;
  const entries = publicationEntries(value);
  if (!entries.length) return <p>{Array.isArray(value) ? 'Empty list []' : 'Empty object {}'}</p>;
  return (
    <dl>
      {entries.map(([key, item]) => (
        <div key={key} className="pub-field">
          <dt>{key}</dt>
          <dd>
            <PublicationValue value={item} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
