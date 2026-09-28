'use client';
import type { StateOverview } from '@t3x-dev/api-client';
import { FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Resource = NonNullable<StateOverview['author']>['document']['resources'][number];
export const resourceUrl = (resource: Resource) =>
  `data:${resource.mediaType};base64,${resource.base64}`;
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

export function StateAuthorReadme({
  author,
  compact = false,
  embedded = false,
}: {
  compact?: boolean;
  embedded?: boolean;
  author?: Pick<NonNullable<StateOverview['author']>['document'], 'readme' | 'resources'>;
}) {
  const resources = author?.resources ?? [];
  return (
    <section
      aria-label="Author README"
      className={
        embedded
          ? ''
          : compact
            ? 'border-t border-[var(--stroke-divider)] pt-3'
            : 'border-t border-[var(--stroke-divider)] pt-4'
      }
    >
      {!embedded && (
        <h3
          className={
            compact
              ? 'mb-2 flex items-center gap-2 text-xs font-medium'
              : 'mb-3 flex items-center gap-2 text-sm font-medium'
          }
        >
          <FileText aria-hidden="true" className="size-4" />
          README <span className="text-[11px] font-normal text-[var(--text-tertiary)]">Author</span>
        </h3>
      )}
      {author?.readme ? (
        <div
          className={
            compact
              ? 'max-w-none break-words text-xs leading-5 text-[var(--text-secondary)] [&_h1]:mb-1 [&_h1]:text-sm [&_h1]:font-semibold [&_h1]:leading-5 [&_h1]:text-[var(--text-primary)] [&_h2]:mb-1 [&_h2]:mt-4 [&_h2]:text-[13px] [&_h2]:font-semibold [&_h2]:leading-5 [&_h2]:text-[var(--text-primary)] [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-[var(--text-primary)] [&_p]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:my-0.5 [&_a]:text-[var(--status-info)] [&_a]:underline-offset-2 hover:[&_a]:underline [&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:border [&_pre]:border-[var(--stroke-divider)] [&_pre]:bg-[var(--surface-app)] [&_pre]:p-3 [&_pre]:text-[11px] [&_table]:my-3 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:rounded [&_table]:border [&_table]:border-[var(--stroke-divider)] [&_table]:text-[11px] [&_table]:leading-4 [&_th]:border-b [&_th]:border-[var(--stroke-divider)] [&_th]:bg-[var(--surface-app)] [&_th]:px-2.5 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_th]:text-[var(--text-primary)] [&_td]:border-b [&_td]:border-[var(--stroke-divider)] [&_td]:px-2.5 [&_td]:py-2 [&_tr:last-child_td]:border-b-0 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--stroke-default)] [&_blockquote]:pl-3'
              : 'max-w-none break-words text-sm leading-6 text-[var(--text-secondary)] [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:text-[var(--text-primary)] [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-[var(--text-primary)] [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:font-semibold [&_p]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-1 [&_a]:text-[var(--status-info)] [&_a]:underline [&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-[var(--status-info-muted)] [&_pre]:p-3 [&_table]:my-3 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_th]:border [&_th]:border-[var(--stroke-divider)] [&_th]:bg-[var(--status-info-muted)] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_td]:border [&_td]:border-[var(--stroke-divider)] [&_td]:px-3 [&_td]:py-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3'
          }
        >
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
  );
}
