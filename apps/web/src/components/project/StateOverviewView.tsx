'use client';

import type { RepositoryProfile, RepositoryProfilePatch } from '@t3x-dev/api-client';
import {
  BookOpen,
  Box,
  ChevronRight,
  Code2,
  FileText,
  GitCommit,
  Globe2,
  Info,
  List,
  LockKeyhole,
  Maximize2,
  Minimize2,
  ShieldCheck,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { resourceUrl, StateAuthorReadme } from '@/components/project/StateAuthorReadme';
import { StateScrollArea } from '@/components/project/StateScrollArea';
import { StateSemanticReader, StateValueReader } from '@/components/project/StateValueReader';
import { Button } from '@/components/ui/button';
import { useStateOverview } from '@/hooks/commits/useStateOverview';
import type { ApiCommit } from '@/types/api';
import { RepositoryProfileEditor } from './RepositoryProfileEditor';
import styles from './StateOverviewView.module.css';

const EMPTY_PROFILE: RepositoryProfile = { readme: '', tags: [] };

function displayName(key: string) {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function preview(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `${value.length} items`;
  return `${Object.keys(value as object).length} fields`;
}

function rowsFor(value: unknown) {
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).slice(0, 5);
}

export function StateOverviewView({
  projectId,
  commitDigest,
  projectName,
  projectDescription,
  projectOwner = 't3x-dev',
  projectVisibility = 'private',
  schemaName,
  schemaHref,
  onViewStructure,
  reader,
  navigation,
  headerOnly = false,
  hideHeader = false,
  historyHref,
  workspaceHref,
  commits = [],
  introductionSource = 'repository',
  repositoryProfile = EMPTY_PROFILE,
  canEditRepository = false,
  onSaveRepositoryProfile,
  stateLoading = false,
  stateError,
}: {
  introductionSource?: 'repository' | 'version';
  repositoryProfile?: RepositoryProfile;
  canEditRepository?: boolean;
  onSaveRepositoryProfile?: (patch: RepositoryProfilePatch) => Promise<void>;
  stateLoading?: boolean;
  stateError?: string | null;
  navigation?: ReactNode;
  headerOnly?: boolean;
  hideHeader?: boolean;
  historyHref?: string;
  workspaceHref?: string;
  commits?: ApiCommit[];
  projectId: string;
  /** `null` renders the repository before its first commit. */
  commitDigest: string | null;
  projectName: string;
  projectDescription?: string;
  projectOwner?: string;
  projectVisibility?: string;
  schemaName?: string;
  schemaHref?: string;
  onViewStructure?: () => void;
  refName?: string;
  validationLabel?: string;
  onAuthorRevision?: (digest: string) => void;
  reader?: (expanded: boolean, expand: () => void) => ReactNode;
}) {
  const { data, error, loading, retry } = useStateOverview(
    projectId,
    headerOnly && introductionSource === 'repository' ? null : commitDigest
  );
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [readmeHeadings, setReadmeHeadings] = useState<string[]>([]);
  const readmeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset the State reader when its version changes without remounting the
    // independent repository editors (and discarding their unsaved input).
    setExpanded(false);
    setSelected(null);
    setContentsOpen(false);
  }, [commitDigest]);

  const version = introductionSource === 'version';
  const empty = !commitDigest;
  if (version && headerOnly && !empty && (loading || error || !data)) return null;
  if (version && !empty && loading)
    return (
      <div className={styles.feedback}>
        {navigation}
        <output>Loading Overview…</output>
      </div>
    );
  if (version && !empty && (error || !data))
    return (
      <div className={styles.feedback} role="alert">
        {navigation}
        <h2>Overview unavailable</h2>
        <p>{error}</p>
        <Button onClick={retry} size="sm" variant="outline">
          Retry
        </Button>
      </div>
    );

  const author = version ? data?.author?.document : undefined;
  const resources = author?.resources ?? [];
  const avatar = resources.find((resource) => resource.path === author?.avatarPath);
  const value = data?.render.model.value;
  const semantic = data?.reading?.kind === 'semantic-content' ? data.reading.value : null;
  const items = semantic
    ? semantic.trees.map((tree, index) => ({
        key: String(index),
        label: tree.key,
        pointer: `/content/trees/${index}`,
      }))
    : (data?.summary.items ?? []).map((item) => ({ ...item, label: item.key }));
  const sections: [string, unknown][] = semantic
    ? semantic.trees
        .flatMap((tree) =>
          tree.children.length
            ? tree.children.map((child): [string, unknown] => [
                child.key,
                {
                  ...child.slots,
                  ...(child.children.length ? { Sections: child.children.length } : {}),
                },
              ])
            : [[tree.key, tree.slots] as [string, unknown]]
        )
        .slice(0, 2)
    : rowsFor(value).slice(0, 2);
  const shownName = projectName;
  const shownOwner = projectOwner;
  const shownVisibility = projectVisibility;
  const shownDescription = version ? author?.description?.trim() : projectDescription?.trim();
  const shownTags = version ? (author?.tags ?? []) : repositoryProfile.tags;
  const canEdit = !version && canEditRepository && onSaveRepositoryProfile;
  const shownSchema = schemaName || 'Not specified';
  const currentCommit = commits.find((commit) => commit.hash === commitDigest);
  const recentCommits = [...commits]
    .sort((a, b) => Date.parse(b.committed_at) - Date.parse(a.committed_at))
    .slice(0, 3);

  const collectHeadings = () => {
    setReadmeHeadings(
      Array.from(readmeRef.current?.querySelectorAll('h1, h2, h3') ?? []).map(
        (heading) => heading.textContent?.trim() || 'Untitled section'
      )
    );
  };

  const projectHeader = (
    <header className={styles.projectHeader}>
      {avatar ? (
        <Image
          src={resourceUrl(avatar)}
          alt={avatar.alt}
          width={96}
          height={96}
          unoptimized
          className={styles.avatar}
        />
      ) : (
        <div className={styles.avatarFallback}>
          <Box aria-hidden="true" />
        </div>
      )}
      <div className={styles.projectIdentity}>
        <div className={styles.titleLine}>
          <h1>{shownName}</h1>
          <span className={styles.visibility}>
            {shownVisibility === 'public' ? (
              <Globe2 aria-hidden="true" />
            ) : (
              <LockKeyhole aria-hidden="true" />
            )}
            {displayName(shownVisibility)}
          </span>
        </div>
        <p className={styles.owner}>
          <span className={styles.publisher}>{shownOwner.slice(0, 1).toUpperCase()}</span>
          <strong>{shownOwner}</strong>
          <i />
          {shownSchema}
          {currentCommit ? (
            <>
              <i />
              <time dateTime={currentCommit.committed_at}>
                Updated {commitDate(currentCommit.committed_at)}
              </time>
            </>
          ) : null}
        </p>
        {shownDescription ? <p className={styles.description}>{shownDescription}</p> : null}
        <fieldset className="min-w-0" aria-label={version ? 'Version tags' : 'Repository tags'}>
          {shownTags.length ? (
            <div className={styles.tags}>
              {shownTags.map((tag) => (
                <span key={tag}>{version || tag.startsWith('#') ? tag : `#${tag}`}</span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-tertiary)]">No tags</p>
          )}
          {canEdit ? (
            <RepositoryProfileEditor
              field="tags"
              profile={repositoryProfile}
              projectName={projectName}
              onSave={canEdit}
            />
          ) : null}
        </fieldset>
      </div>
    </header>
  );
  if (headerOnly)
    return (
      <div className={styles.sharedHeader}>
        <div className={styles.page}>{projectHeader}</div>
      </div>
    );

  return (
    <div className={styles.root} data-testid="state-overview">
      <div className={styles.page}>
        {!expanded && !hideHeader ? projectHeader : null}

        {navigation !== undefined ? (
          navigation
        ) : (
          <div className={styles.toolbar}>
            <div className={styles.actions}>
              {historyHref ? <Link href={historyHref}>History</Link> : null}
              {workspaceHref ? (
                <Link href={workspaceHref} className={styles.primary}>
                  Propose change
                </Link>
              ) : null}
            </div>
          </div>
        )}
        <div className={expanded ? styles.expanded : styles.columns}>
          {!expanded ? (
            <section
              aria-label={version ? 'Version introduction' : 'Repository information'}
              className={styles.readmeCard}
            >
              <div className={styles.cardTitle}>
                <BookOpen aria-hidden="true" />
                <strong>{version ? 'Version introduction' : 'README'}</strong>
                {canEdit ? (
                  <RepositoryProfileEditor
                    field="readme"
                    profile={repositoryProfile}
                    projectName={projectName}
                    projectDescription={projectDescription}
                    onSave={canEdit}
                  />
                ) : null}
                <button
                  type="button"
                  aria-expanded={contentsOpen}
                  onClick={() => {
                    if (!contentsOpen) collectHeadings();
                    setContentsOpen(!contentsOpen);
                  }}
                  className={styles.contentsButton}
                >
                  <List aria-hidden="true" /> Contents
                </button>
              </div>
              {contentsOpen ? (
                <nav aria-label="README contents" className={styles.contents}>
                  {readmeHeadings.map((heading, index) => (
                    <button
                      key={`${index}:${heading}`}
                      type="button"
                      onClick={() => {
                        setContentsOpen(false);
                        readmeRef.current
                          ?.querySelectorAll('h1, h2, h3')
                          [index]?.scrollIntoView({ block: 'start' });
                      }}
                    >
                      {heading}
                      <ChevronRight aria-hidden="true" />
                    </button>
                  ))}
                  {!readmeHeadings.length ? <span>No README headings</span> : null}
                </nav>
              ) : null}
              <div className={styles.readmeBody} ref={readmeRef}>
                {version ? (
                  <StateAuthorReadme author={author} compact embedded />
                ) : (
                  <StateAuthorReadme
                    author={{ readme: repositoryProfile.readme, resources: [] }}
                    label="Repository README"
                    emptyMessage="No README added yet."
                    showUnavailableImages
                    embedded
                  />
                )}
              </div>
            </section>
          ) : null}

          <aside aria-label="T3X rendered State" className={styles.sideColumn}>
            <section className={styles.stateCard}>
              <div className={styles.cardTitle}>
                <GitCommit aria-hidden="true" />
                <strong>State</strong>
                {stateLoading || loading ? (
                  <span>Loading State…</span>
                ) : stateError || error ? (
                  <span>State unavailable</span>
                ) : empty ? (
                  <span>No commits yet</span>
                ) : (
                  <>
                    <span className={styles.committed}>Committed</span>
                    <button
                      type="button"
                      aria-label={expanded ? 'Restore split view' : 'Expand rendered State'}
                      className={styles.expandButton}
                      onClick={() => setExpanded(!expanded)}
                    >
                      {expanded ? (
                        <Minimize2 aria-hidden="true" />
                      ) : (
                        <Maximize2 aria-hidden="true" />
                      )}
                      {expanded ? 'Restore' : 'Expand'}
                    </button>
                  </>
                )}
              </div>
              {stateLoading || loading ? (
                <output>Loading committed State…</output>
              ) : stateError || error || (!empty && !data) ? (
                <div role="alert" className={styles.feedback}>
                  <p>{stateError || error || 'State unavailable'}</p>
                  {error ? (
                    <Button size="sm" variant="outline" onClick={retry}>
                      Retry State
                    </Button>
                  ) : null}
                </div>
              ) : empty ? (
                <>
                  <p>
                    This branch has no committed state yet. Create the first change in a Workspace.
                  </p>
                  {workspaceHref ? (
                    <Link className={styles.primary} href={workspaceHref}>
                      Propose change
                    </Link>
                  ) : null}
                </>
              ) : (
                <div className={styles.stateContent}>
                  <div className={styles.stateMeta}>
                    <span>
                      <GitCommit aria-hidden="true" />
                      <code>{commitDigest?.replace(/^sha256:/, '').slice(0, 7)}</code>
                    </span>
                    <span className={styles.schemaPill}>{shownSchema}</span>
                  </div>
                  {expanded && items.length > 0 ? (
                    <nav aria-label="State sections" className={styles.contents}>
                      {items.map((item) => (
                        <button
                          key={item.pointer}
                          type="button"
                          onClick={() => setSelected(item.key)}
                        >
                          {displayName(item.label || '(empty key)')}
                          <ChevronRight aria-hidden="true" />
                        </button>
                      ))}
                    </nav>
                  ) : null}
                  {expanded ? (
                    <div className={styles.fullRender}>
                      {reader && selected === null ? (
                        reader(true, () => setExpanded(true))
                      ) : (
                        <StateScrollArea
                          id="overview-render-content"
                          label="Rendered committed content"
                          className="min-h-0 flex-1"
                          viewportClassName="p-4"
                        >
                          {semantic ? (
                            <>
                              <BackButton selected={selected} onBack={() => setSelected(null)} />
                              <StateSemanticReader
                                trees={
                                  selected === null
                                    ? semantic.trees
                                    : [semantic.trees[Number(selected)]]
                                }
                              />
                            </>
                          ) : selected !== null &&
                            value !== null &&
                            typeof value === 'object' &&
                            Object.hasOwn(value, selected) ? (
                            <>
                              <BackButton selected={selected} onBack={() => setSelected(null)} />
                              <StateValueReader
                                value={(value as Record<string, unknown>)[selected]}
                              />
                            </>
                          ) : (
                            <StateValueReader value={value} />
                          )}
                        </StateScrollArea>
                      )}
                    </div>
                  ) : (
                    <GenericStateSummary sections={sections} value={value} />
                  )}
                  {!expanded ? (
                    <p className={styles.recordNote}>
                      <ShieldCheck aria-hidden="true" />
                      This is a read-only view of committed state. To change it, propose a change.
                    </p>
                  ) : null}
                  {!expanded && onViewStructure ? (
                    <button type="button" onClick={onViewStructure} className={styles.viewLink}>
                      <Code2 aria-hidden="true" />
                      View structure <span>→</span>
                    </button>
                  ) : null}
                </div>
              )}
            </section>

            {!expanded && recentCommits.length ? (
              <section className={styles.recent} aria-label="Recent commits">
                <div className={styles.cardTitle}>
                  <strong>Recent commits</strong>
                  {historyHref ? <Link href={historyHref}>View all</Link> : null}
                </div>
                <ol>
                  {recentCommits.map((commit) => (
                    <li key={commit.hash}>
                      <span className={styles.commitDot} />
                      <div>
                        <Link
                          href={`/project/${encodeURIComponent(projectId)}?view=overview&branch=${encodeURIComponent(commit.branch)}&commit=${encodeURIComponent(commit.hash)}`}
                        >
                          {commit.message || 'Committed state'}
                        </Link>
                        <span>
                          {commit.author?.name ||
                            commit.author?.id ||
                            commit.author?.type ||
                            'Author not recorded'}{' '}
                          ·{' '}
                          <time dateTime={commit.committed_at}>
                            {commitDate(commit.committed_at)}
                          </time>
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
            {!expanded ? (
              <section className={styles.aboutCard}>
                <div className={styles.cardTitle}>
                  <Info aria-hidden="true" />
                  <strong>About</strong>
                </div>
                <div className={styles.aboutContent}>
                  <div className={styles.aboutRow}>
                    <span>Owner</span>
                    <strong>
                      {avatar ? (
                        <Image
                          src={resourceUrl(avatar)}
                          alt=""
                          width={24}
                          height={24}
                          unoptimized
                          className={styles.ownerAvatar}
                        />
                      ) : (
                        <Box aria-hidden="true" />
                      )}
                      {shownOwner}
                    </strong>
                  </div>
                  <div className={styles.aboutRow}>
                    <span>Visibility</span>
                    <strong>
                      {shownVisibility === 'public' ? (
                        <Globe2 aria-hidden="true" />
                      ) : (
                        <LockKeyhole aria-hidden="true" />
                      )}
                      {displayName(shownVisibility)}
                    </strong>
                  </div>
                  <div className={styles.aboutRow}>
                    <span>Schema</span>
                    <strong>
                      <FileText aria-hidden="true" />
                      {shownSchema}
                    </strong>
                    {schemaHref ? <Link href={schemaHref}>View schemas →</Link> : null}
                  </div>
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}

function commitDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'Date unavailable';
}

function GenericStateSummary({
  sections,
  value,
}: {
  sections: [string, unknown][];
  value: unknown;
}) {
  return (
    <div id="overview-render-content" className={styles.stateSections}>
      {sections.length ? (
        sections.map(([key, sectionValue]) => (
          <div key={key} className={styles.stateSection}>
            <h3>{displayName(key)}</h3>
            {rowsFor(sectionValue).length ? (
              rowsFor(sectionValue).map(([rowKey, rowValue]) => (
                <div className={styles.stateRow} key={rowKey}>
                  <span>{displayName(rowKey)}</span>
                  <strong>{preview(rowValue)}</strong>
                </div>
              ))
            ) : (
              <div className={styles.stateRow}>
                <span>Value</span>
                <strong>{preview(sectionValue)}</strong>
              </div>
            )}
          </div>
        ))
      ) : (
        <p>{preview(value)}</p>
      )}
    </div>
  );
}

function BackButton({ selected, onBack }: { selected: string | null; onBack: () => void }) {
  return selected !== null ? (
    <button type="button" className={styles.backButton} onClick={onBack}>
      ← All sections
    </button>
  ) : null;
}
