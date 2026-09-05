'use client';
import type { StateOverview } from '@t3x-dev/api-client';
import { Box, ChevronRight, FileText, Maximize2, Minimize2 } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { StateScrollArea } from '@/components/project/StateScrollArea';
import { Button } from '@/components/ui/button';
import { useStateOverview } from '@/hooks/commits/useStateOverview';

type Resource = NonNullable<StateOverview['author']>['document']['resources'][number];
const resourceUrl = (resource: Resource) => `data:${resource.mediaType};base64,${resource.base64}`;
function authorUrl(url: string, key: string, resources: Resource[]) {
  const resource = resources.find((item) => item.path === url.replace(/^\.\//, ''));
  if (resource) return resourceUrl(resource);
  if (key === 'src') return '';
  if (/^#[a-zA-Z0-9_-]+$/.test(url)) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) return parsed.href;
  } catch {
    /* relative non-resource links are unavailable */
  }
  return '';
}
export function StateOverviewView({
  projectId,
  commitDigest,
  projectName,
}: {
  projectId: string;
  commitDigest: string;
  projectName: string;
}) {
  const { data, error, loading, retry } = useStateOverview(projectId, commitDigest);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  if (loading)
    return <output className="p-6 text-sm text-[var(--text-secondary)]">Loading Overview…</output>;
  if (error || !data)
    return (
      <div className="p-6" role="alert">
        <h2 className="font-medium">Overview unavailable</h2>
        <p className="my-2 text-sm text-[var(--text-secondary)]">{error}</p>
        <Button onClick={retry} size="sm" variant="outline">
          Retry
        </Button>
      </div>
    );
  const author = data.author?.document;
  const resources = author?.resources ?? [];
  const avatar = resources.find((resource) => resource.path === author?.avatarPath);
  const value = data.render.model.value;
  return (
    <div
      data-testid="state-overview"
      className={`grid min-h-0 flex-1 overflow-auto ${expanded ? '' : 'lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)]'} lg:overflow-hidden`}
    >
      {!expanded && (
        <section
          aria-label="Project introduction"
          className="min-w-0 p-5 lg:overflow-y-auto lg:p-6"
        >
          <header className="mb-5 flex items-start gap-3">
            {avatar ? (
              <img
                src={resourceUrl(avatar)}
                alt={avatar.alt}
                className="size-12 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <Box
                aria-hidden="true"
                className="mt-1 size-9 shrink-0 text-[var(--text-tertiary)]"
              />
            )}
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                {projectName}
              </h2>
              {author && (
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--text-secondary)]">
                  {author.description}
                </p>
              )}
              <span className="mt-1 inline-block text-[11px] text-[var(--text-tertiary)]">
                {author ? 'Introduction · Author' : 'No author introduction published'}
              </span>
            </div>
          </header>
          <section
            aria-label="T3X definition summary"
            className="mb-5 overflow-hidden rounded-lg border border-blue-500/20 bg-blue-500/[0.04]"
          >
            <header className="flex items-center gap-2 border-b border-blue-500/15 px-3 py-2.5 text-sm font-medium">
              <Box aria-hidden="true" className="size-4 text-blue-500" />
              State summary{' '}
              <span className="ml-auto rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-600 dark:text-blue-300">
                T3X derived
              </span>
            </header>
            {!!author?.tags.length && (
              <div className="flex flex-wrap items-center gap-1.5 border-b border-blue-500/10 px-3 py-2">
                <span className="mr-1 text-[11px] text-[var(--text-tertiary)]">Author tags</span>
                {author.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-[var(--surface-panel)] px-2 py-0.5 text-xs text-[var(--text-secondary)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {data.summary.items.map((item) => (
              <button
                key={item.pointer}
                aria-pressed={selected === item.key}
                type="button"
                onClick={() => {
                  setSelected(item.key);
                  document
                    .getElementById('overview-render-content')
                    ?.scrollIntoView({ block: 'nearest' });
                }}
                className="flex w-full items-center gap-3 border-b border-blue-500/10 px-3 py-2 text-left last:border-0 hover:bg-blue-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
              >
                <Box aria-hidden="true" className="size-3.5 shrink-0 text-blue-500" />
                <span className="min-w-0 flex-1 truncate text-sm">{item.key}</span>
                <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                  {item.type}
                  {item.childCount !== null ? ` · ${item.childCount}` : ''}
                </span>
                <ChevronRight aria-hidden="true" className="size-3.5" />
              </button>
            ))}
            {!data.summary.items.length && (
              <p className="px-3 py-3 text-sm text-[var(--text-secondary)]">
                {data.summary.rootType} · No top-level sections
              </p>
            )}
            {data.summary.truncated && (
              <p className="px-3 py-2 text-xs">
                100 of {data.summary.total} sections · Full content in render
              </p>
            )}
          </section>
          <section
            aria-label="Author README"
            className="border-t border-[var(--stroke-divider)] pt-4"
          >
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
              <FileText aria-hidden="true" className="size-4" />
              README{' '}
              <span className="text-[11px] font-normal text-[var(--text-tertiary)]">Author</span>
            </h3>
            {author?.readme ? (
              <div className="max-w-none break-words text-sm leading-6 text-[var(--text-secondary)] [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:text-[var(--text-primary)] [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-[var(--text-primary)] [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:font-semibold [&_p]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-1 [&_a]:text-blue-600 [&_a]:underline [&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-blue-500/5 [&_pre]:p-3 [&_table]:my-3 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_th]:border [&_th]:border-[var(--stroke-divider)] [&_th]:bg-blue-500/5 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_td]:border [&_td]:border-[var(--stroke-divider)] [&_td]:px-3 [&_td]:py-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3">
                <ReactMarkdown
                  skipHtml
                  remarkPlugins={[remarkGfm]}
                  urlTransform={(url, key) => authorUrl(url, key, resources)}
                  components={{
                    a: ({ href, children }) =>
                      href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer">
                          {children}
                        </a>
                      ) : (
                        <span>{children}</span>
                      ),
                    img: ({ src, alt }) =>
                      src ? <img src={src} alt={alt ?? ''} loading="lazy" /> : null,
                  }}
                >
                  {author.readme}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-tertiary)]">
                No README published for this revision.
              </p>
            )}
          </section>
        </section>
      )}
      <aside
        aria-label="T3X rendered State"
        className="flex min-h-[320px] min-w-0 flex-col border-t border-blue-500/15 bg-blue-500/[0.035] lg:min-h-0 lg:border-l lg:border-t-0"
      >
        <header className="shrink-0 border-b border-blue-500/15 p-4">
          <div className="flex items-center gap-2">
            <Box className="size-5 text-blue-500" aria-hidden="true" />
            <h3 className="font-medium">Rendered State</h3>
            <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-600 dark:text-blue-300">
              T3X
            </span>
            <Button
              aria-label={expanded ? 'Restore split view' : 'Expand rendered State'}
              className="ml-auto size-7"
              variant="ghost"
              size="icon"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
          </div>
          <p className="mt-2 font-mono text-[11px] text-[var(--text-secondary)]">
            Generic renderer · {commitDigest.slice(7, 19)}
          </p>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            State loaded · Generic fallback
          </p>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            Schema not resolved · Validation not run
          </p>
        </header>
        <StateScrollArea
          id="overview-render-content"
          label="Rendered committed content"
          className="min-h-0 flex-1"
          viewportClassName="p-4"
        >
          {selected !== null &&
          value !== null &&
          typeof value === 'object' &&
          Object.hasOwn(value, selected) ? (
            <>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="mb-3 text-xs text-blue-600 dark:text-blue-300"
              >
                ← All sections
              </button>
              <h4 className="mb-2 break-all font-mono text-xs">
                /{selected.replace(/~/g, '~0').replace(/\//g, '~1')}
              </h4>
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6">
                {JSON.stringify((value as Record<string, unknown>)[selected], null, 2)}
              </pre>
            </>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6">
              {data.render.recovery.json}
            </pre>
          )}
        </StateScrollArea>
      </aside>
    </div>
  );
}
