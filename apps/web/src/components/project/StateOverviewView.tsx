'use client';

import type { RepositoryProfile, RepositoryProfilePatch } from '@t3x-dev/api-client';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Braces,
  ChevronRight,
  GitCommitHorizontal,
  Globe2,
  History,
  List,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { StateAuthorReadme } from '@/components/project/StateAuthorReadme';
import { StateValueReader } from '@/components/project/StateValueReader';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { relativeTime, shortHash } from '@/domain/format/formatters';
import { buildStatePointRows } from '@/domain/project/stateViewModel';
import { useStateOverview } from '@/hooks/commits/useStateOverview';
import type { ApiCommit } from '@/types/api';
import { RepositoryDescriptionEditor } from './RepositoryDescriptionEditor';
import { RepositoryProfileEditor } from './RepositoryProfileEditor';
import styles from './StateOverviewView.module.css';
import { StatePageFooter } from './StatePageFrame';
import { StateStructureSummary } from './StateStructureSummary';

const EMPTY_PROFILE: RepositoryProfile = { readme: '', tags: [] };
function displayName(key: string) {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function StateOverviewView({
  projectId,
  commitDigest,
  commit,
  projectName,
  projectDescription,
  projectOwner = 't3x-dev',
  projectVisibility = 'private',
  schemaName,
  schemaHref,
  onViewStructure,
  validationLabel,
  refName,
  reader,
  navigation,
  headerOnly = false,
  hideHeader = false,
  embedded = false,
  historyHref,
  alternateHistoryHref,
  workspaceHref,
  introductionSource = 'repository',
  repositoryProfile = EMPTY_PROFILE,
  canEditRepository = false,
  onSaveRepositoryProfile,
  onSaveDescription,
  stateLoading = false,
  stateError,
}: {
  introductionSource?: 'repository' | 'version';
  repositoryProfile?: RepositoryProfile;
  canEditRepository?: boolean;
  onSaveRepositoryProfile?: (patch: RepositoryProfilePatch) => Promise<void>;
  onSaveDescription?: (description: string) => Promise<void>;
  stateLoading?: boolean;
  stateError?: string | null;
  navigation?: ReactNode;
  headerOnly?: boolean;
  hideHeader?: boolean;
  embedded?: boolean;
  historyHref?: string;
  alternateHistoryHref?: string;
  historyReturnTo?: string;
  workspaceHref?: string;
  commits?: ApiCommit[];
  commit?: ApiCommit | null;
  projectId: string;
  /** `null` renders the repository before its first commit. */
  commitDigest: string | null;
  projectName: string;
  projectDescription?: string;
  projectOwner?: string;
  projectVisibility?: string;
  schemaName?: string;
  schemaHref?: string;
  onViewStructure?: (path?: string) => void;
  refName?: string;
  validationLabel?: string;
  onAuthorRevision?: (digest: string) => void;
  reader?: (expanded: boolean, expand: () => void) => ReactNode;
}) {
  const currentCommit =
    commit?.hash === commitDigest && commit.project_id === projectId ? commit : null;
  const committedContent = currentCommit?.content;
  const hasCommittedContent = Boolean(committedContent || reader);
  const { data, error, loading, retry } = useStateOverview(
    projectId,
    introductionSource === 'repository' && (headerOnly || hasCommittedContent) ? null : commitDigest
  );
  const [contentsOpen, setContentsOpen] = useState(false);
  const [readmeHeadings, setReadmeHeadings] = useState<string[]>([]);
  const readmeRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const readmeHeaderRef = useRef<HTMLElement>(null);
  const contentsTargetRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    setContentsOpen(false);
  }, [projectId, commitDigest]);

  const version = introductionSource === 'version';
  const introductionLoading = stateLoading || loading;
  const introductionError = stateError || error;
  const empty = !commitDigest;
  // Historical introductions belong to this revision; never borrow current repository metadata.
  const author =
    version && !introductionLoading && !introductionError ? data?.author?.document : undefined;
  const shownDescription = version ? author?.description?.trim() : projectDescription?.trim();
  const readme = version ? author?.readme : repositoryProfile.readme;
  const hasReadme = Boolean(readme?.trim());
  const shownTags = version ? (author?.tags ?? []) : repositoryProfile.tags;
  const canEdit = !version && canEditRepository && onSaveRepositoryProfile;
  const canEditDescription = !version && canEditRepository && onSaveDescription;
  const value = data?.render.model.value;
  const semantic =
    committedContent ?? (data?.reading?.kind === 'semantic-content' ? data.reading.value : null);
  const structureRows = useMemo(() => (semantic ? buildStatePointRows(semantic) : []), [semantic]);
  const rootCount = structureRows.filter((row) => row.depth === 0).length;
  const commitHref =
    historyHref && currentCommit
      ? `${historyHref}${historyHref.includes('?') ? '&' : '?'}commit=${encodeURIComponent(currentCommit.hash)}`
      : undefined;

  const projectHeader = (
    <header className={styles.projectHeader}>
      <h1>{projectName}</h1>
      <span>{projectOwner}</span>
      <span className={styles.visibility}>
        {projectVisibility === 'public' ? (
          <Globe2 aria-hidden="true" />
        ) : (
          <LockKeyhole aria-hidden="true" />
        )}
        {displayName(projectVisibility)}
      </span>
    </header>
  );
  if (headerOnly) return <div className={styles.page}>{projectHeader}</div>;

  const failed = stateError || (!hasCommittedContent && (error || (!empty && !loading && !data)));
  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${embedded ? styles.embedded : ''}`}
      data-testid="state-overview"
    >
      <div className={styles.page}>
        {!hideHeader ? projectHeader : null}
        {navigation !== undefined ? (
          navigation
        ) : (
          <div className={styles.toolbar}>
            <div className={styles.actions}>
              {workspaceHref ? (
                <Link href={workspaceHref} className={styles.primary}>
                  Propose change
                </Link>
              ) : null}
            </div>
          </div>
        )}
        <div className={styles.informationLayout}>
          <div className={styles.mainColumn}>
            <section
              aria-label={version ? 'Version introduction' : 'Repository information'}
              className={styles.readmeContent}
            >
              <header ref={readmeHeaderRef} tabIndex={-1} className={styles.readmeHeader}>
                <h2>
                  <BookOpen aria-hidden="true" />
                  {version ? 'Version introduction' : 'README'}
                </h2>
                <div className={styles.readmeActions}>
                  {hasReadme ? (
                    <Popover
                      open={contentsOpen}
                      onOpenChange={(open) => {
                        if (open)
                          setReadmeHeadings(
                            Array.from(readmeRef.current?.querySelectorAll('h1, h2, h3') ?? []).map(
                              (heading) => heading.textContent?.trim() || 'Untitled section'
                            )
                          );
                        setContentsOpen(open);
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-expanded={contentsOpen}
                        >
                          <List aria-hidden="true" />
                          Contents
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="end"
                        className={styles.contents}
                        onCloseAutoFocus={(event) => {
                          const target = contentsTargetRef.current;
                          if (!target) return;
                          event.preventDefault();
                          contentsTargetRef.current = null;
                          target.tabIndex = -1;
                          target.focus({ preventScroll: true });
                          target.scrollIntoView({ block: 'start' });
                        }}
                      >
                        <nav aria-label="README contents">
                          {readmeHeadings.map((heading, index) => (
                            <button
                              key={`${index}:${heading}`}
                              type="button"
                              onClick={() => {
                                contentsTargetRef.current =
                                  readmeRef.current?.querySelectorAll<HTMLElement>('h1, h2, h3')[
                                    index
                                  ] ?? null;
                                setContentsOpen(false);
                              }}
                            >
                              {heading}
                              <ChevronRight aria-hidden="true" />
                            </button>
                          ))}
                          {!readmeHeadings.length ? <span>No README headings</span> : null}
                        </nav>
                      </PopoverContent>
                    </Popover>
                  ) : null}
                  {canEdit && hasReadme ? (
                    <RepositoryProfileEditor
                      field="readme"
                      profile={repositoryProfile}
                      projectName={projectName}
                      projectDescription={projectDescription}
                      onSave={canEdit}
                    />
                  ) : null}
                </div>
              </header>
              <div ref={readmeRef} className={styles.readmeBody}>
                {version && (introductionLoading || introductionError) ? (
                  <>
                    <p>
                      {introductionLoading
                        ? 'Loading version introduction…'
                        : 'Version introduction unavailable.'}
                    </p>
                    {error && hasCommittedContent ? (
                      <Button size="sm" variant="outline" onClick={retry}>
                        Retry introduction
                      </Button>
                    ) : null}
                  </>
                ) : version ? (
                  <StateAuthorReadme author={author} embedded markdownClassName={styles.markdown} />
                ) : hasReadme ? (
                  <StateAuthorReadme
                    author={{ readme: repositoryProfile.readme, resources: [] }}
                    label="Repository README"
                    emptyMessage="No README added yet."
                    showUnavailableImages
                    embedded
                    markdownClassName={styles.markdown}
                  />
                ) : (
                  <div className={styles.emptyReadme}>
                    <h3>{canEdit ? 'Introduce your repository' : 'No repository introduction'}</h3>
                    <p>No README added yet.</p>
                    {canEdit ? (
                      <>
                        <p>Describe its purpose, how to use it, and where to start.</p>
                        <RepositoryProfileEditor
                          field="readme"
                          profile={repositoryProfile}
                          projectName={projectName}
                          projectDescription={projectDescription}
                          onSave={canEdit}
                        />
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            </section>
          </div>
          <aside className={styles.sidebar} aria-label="State information">
            <section
              className={styles.about}
              aria-label={version ? 'About this version' : 'About this project'}
            >
              {canEditDescription ? (
                <RepositoryDescriptionEditor
                  key={projectId}
                  description={shownDescription ?? ''}
                  onSave={canEditDescription}
                />
              ) : shownDescription ? (
                <p className={styles.description}>{shownDescription}</p>
              ) : null}
              <fieldset
                className={styles.tags}
                aria-label={version ? 'Version tags' : 'Repository tags'}
              >
                {shownTags.map((tag) => (
                  <span key={tag} className={styles.tag}>
                    {version || tag.startsWith('#') ? tag : `#${tag}`}
                  </span>
                ))}
                {canEdit ? (
                  <RepositoryProfileEditor
                    field="tags"
                    profile={repositoryProfile}
                    projectName={projectName}
                    onSave={canEdit}
                  />
                ) : null}
              </fieldset>
            </section>
            <section aria-label="Committed State" className={styles.stateContent}>
              <header className={styles.contentHeading}>
                <h2>Structure</h2>
                {rootCount > 0 && !stateLoading && !failed ? (
                  <span className={styles.rootCount}>
                    {rootCount} root {rootCount === 1 ? 'node' : 'nodes'}
                  </span>
                ) : null}
              </header>
              {stateLoading || (!hasCommittedContent && loading) ? (
                <output className={styles.feedback}>Loading committed State…</output>
              ) : failed ? (
                <div role="alert" className={styles.feedback}>
                  <h3>State unavailable</h3>
                  <p>{stateError || error || 'This revision could not be loaded.'}</p>
                  {error ? (
                    <Button size="sm" variant="outline" onClick={retry}>
                      Retry State
                    </Button>
                  ) : null}
                </div>
              ) : empty ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyContent}>
                    <h3>No commits yet</h3>
                    <p>
                      Committed content will appear here. Prepare your first change in a Workspace,
                      then review and commit it.
                    </p>
                    {workspaceHref ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={workspaceHref}>
                          Propose change
                          <ArrowRight aria-hidden="true" />
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : semantic ? (
                <StateStructureSummary
                  key={commitDigest}
                  rows={structureRows}
                  onInspect={onViewStructure}
                />
              ) : value !== undefined ? (
                <div className={styles.structureTree}>
                  <StateValueReader compact value={value} />
                </div>
              ) : (
                <p className={styles.sidebarHint}>Open the full view to inspect this State.</p>
              )}
              {onViewStructure && !empty && !stateLoading && !failed ? (
                <button
                  type="button"
                  className={styles.sidebarLink}
                  onClick={() => onViewStructure()}
                >
                  Open full view <ArrowUpRight aria-hidden="true" />
                </button>
              ) : null}
            </section>
            <section
              aria-label={version ? 'Viewed version' : 'Current version'}
              className={styles.version}
            >
              <h2>{version ? 'Viewed version' : 'Current version'}</h2>
              {stateLoading ? (
                <p className={styles.sidebarHint}>Loading version…</p>
              ) : failed ? (
                <p className={styles.sidebarHint}>Version unavailable.</p>
              ) : currentCommit ? (
                <>
                  {commitHref ? (
                    <Link className={styles.commitMessage} href={commitHref}>
                      {currentCommit.message || 'Committed state'}
                    </Link>
                  ) : (
                    <p className={styles.commitMessage}>
                      {currentCommit.message || 'Committed state'}
                    </p>
                  )}
                  <div className={styles.commitMeta}>
                    <span>
                      {currentCommit.author?.name ||
                        currentCommit.author?.id ||
                        currentCommit.author?.type ||
                        'Author not recorded'}
                    </span>
                    {currentCommit.committed_at &&
                    Number.isFinite(Date.parse(currentCommit.committed_at)) ? (
                      <time
                        dateTime={currentCommit.committed_at}
                        title={new Date(currentCommit.committed_at).toLocaleString()}
                      >
                        {relativeTime(currentCommit.committed_at)}
                      </time>
                    ) : null}
                  </div>
                  <p className={styles.commitHash}>
                    <GitCommitHorizontal aria-hidden="true" />
                    <code>{shortHash(currentCommit.hash)}</code>
                  </p>
                </>
              ) : empty ? (
                <p className={styles.sidebarHint}>No committed version yet.</p>
              ) : null}
              <dl className={styles.metadata}>
                {schemaName && !empty && !stateLoading && !failed ? (
                  <div>
                    <dt>
                      <Braces aria-hidden="true" />
                      Schema
                    </dt>
                    <dd>{schemaHref ? <Link href={schemaHref}>{schemaName}</Link> : schemaName}</dd>
                  </div>
                ) : null}
                {validationLabel && !empty && !stateLoading && !failed ? (
                  <div>
                    <dt>
                      <ShieldCheck aria-hidden="true" />
                      Validation
                    </dt>
                    <dd>{validationLabel}</dd>
                  </div>
                ) : null}
              </dl>
              {historyHref && !embedded ? (
                <nav aria-label="History navigation" className={styles.historyLinks}>
                  <Link href={historyHref} className={styles.sidebarLink}>
                    <History aria-hidden="true" />
                    {alternateHistoryHref ? 'History 1' : 'History'}
                    <ArrowUpRight aria-hidden="true" />
                  </Link>
                  {alternateHistoryHref ? (
                    <Link href={alternateHistoryHref} className={styles.sidebarLink}>
                      <History aria-hidden="true" />
                      History 2<ArrowUpRight aria-hidden="true" />
                    </Link>
                  ) : null}
                </nav>
              ) : null}
            </section>
          </aside>
        </div>
        {!embedded ? (
          <StatePageFooter
            projectName={projectName}
            branch={refName}
            onBackToTop={() => {
              rootRef.current?.scrollTo({ top: 0, behavior: 'auto' });
              readmeHeaderRef.current?.focus({ preventScroll: true });
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
