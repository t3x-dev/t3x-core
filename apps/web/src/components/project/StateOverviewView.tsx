'use client';

import {
  initialRepositoryReadme,
  type RepositoryProfile,
  type RepositoryProfilePatch,
} from '@t3x-dev/api-client';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Braces,
  GitCommitHorizontal,
  Globe2,
  List,
  LockKeyhole,
  Pencil,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { StateAuthorReadme } from '@/components/project/StateAuthorReadme';
import { StateValueReader } from '@/components/project/StateValueReader';
import { Button } from '@/components/ui/button';
import { commitTitle, relativeTime, shortHash } from '@/domain/format/formatters';
import { historyCommitHref } from '@/domain/project/objectLocation';
import { buildStatePointRows } from '@/domain/project/stateViewModel';
import { useStateOverview } from '@/hooks/commits/useStateOverview';
import type { ApiCommit } from '@/types/api';
import { RepositoryDescriptionEditor } from './RepositoryDescriptionEditor';
import { RepositoryTag } from './RepositoryIdentity';
import { RepositoryProfileEditor } from './RepositoryProfileEditor';
import styles from './StateOverviewView.module.css';
import { StatePageFooter } from './StatePageFrame';
import { StateReadmeEditor } from './StateReadmeEditor';
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
  repositoryNamespace,
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
  repositoryNamespace?: string;
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
  const [readmeHeadings, setReadmeHeadings] = useState<{ title: string; level: number }[]>([]);
  const contentsId = useId();
  const readmeRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const readmeHeaderRef = useRef<HTMLElement>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [projectId, introductionSource]);
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
  useEffect(() => {
    if (contentsOpen)
      setReadmeHeadings(
        Array.from(readmeRef.current?.querySelectorAll('h1,h2,h3,h4,h5,h6') ?? [], (h) => ({
          title: h.textContent?.trim() || 'Untitled section',
          level: Number(h.tagName.slice(1)),
        }))
      );
  }, [contentsOpen, readme]);
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
    historyHref && currentCommit ? historyCommitHref(historyHref, currentCommit) : undefined;

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
              {editing && canEdit ? (
                <StateReadmeEditor
                  key={projectId}
                  initial={
                    hasReadme
                      ? repositoryProfile.readme
                      : initialRepositoryReadme(projectName, projectDescription)
                  }
                  onSave={canEdit}
                  onClose={() => {
                    setEditing(false);
                    requestAnimationFrame(() =>
                      readmeHeaderRef.current?.focus({ preventScroll: true })
                    );
                  }}
                />
              ) : (
                <>
                  <header ref={readmeHeaderRef} tabIndex={-1} className={styles.readmeHeader}>
                    <h2>
                      <BookOpen aria-hidden="true" />
                      {version ? 'Version introduction' : 'README'}
                    </h2>
                    <div className={styles.readmeActions}>
                      {hasReadme ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-expanded={contentsOpen}
                          aria-controls={contentsOpen ? contentsId : undefined}
                          onClick={() => setContentsOpen(!contentsOpen)}
                        >
                          <List aria-hidden="true" /> Contents
                        </Button>
                      ) : null}
                      {canEdit && hasReadme ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setContentsOpen(false);
                            setEditing(true);
                          }}
                        >
                          <Pencil aria-hidden="true" /> Edit README
                        </Button>
                      ) : null}
                    </div>
                  </header>
                  {contentsOpen && hasReadme ? (
                    <nav id={contentsId} aria-label="README contents" className={styles.contents}>
                      {readmeHeadings.map((heading, index) => (
                        <button
                          key={`${index}:${heading.title}`}
                          style={{ paddingInlineStart: 8 + (heading.level - 1) * 12 }}
                          type="button"
                          onClick={() => {
                            const target =
                              readmeRef.current?.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')[
                                index
                              ];
                            if (target) {
                              target.tabIndex = -1;
                              target.focus({ preventScroll: true });
                              target.scrollIntoView({ block: 'start' });
                            }
                          }}
                        >
                          {heading.title}
                        </button>
                      ))}
                      {!readmeHeadings.length && <span>No README headings</span>}
                    </nav>
                  ) : null}
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
                      <StateAuthorReadme
                        author={author}
                        embedded
                        markdownClassName={styles.markdown}
                      />
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
                        <h3>
                          {canEdit ? 'Introduce your repository' : 'No repository introduction'}
                        </h3>
                        <p>No README added yet.</p>
                        {canEdit ? (
                          <>
                            <p>Describe its purpose, how to use it, and where to start.</p>
                            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                              Add README
                            </Button>
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                </>
              )}
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
                  <RepositoryTag key={tag} name={tag} />
                ))}
                {canEdit ? (
                  <RepositoryProfileEditor
                    key={projectId}
                    suggestionsNamespace={repositoryNamespace}
                    profile={repositoryProfile}
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
                      {commitTitle(currentCommit.message)}
                    </Link>
                  ) : (
                    <p className={styles.commitMessage}>{commitTitle(currentCommit.message)}</p>
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
                    History
                  </Link>
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
