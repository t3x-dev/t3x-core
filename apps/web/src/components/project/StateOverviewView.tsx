'use client';

import type { RepositoryProfile, RepositoryProfilePatch } from '@t3x-dev/api-client';
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  GitCommitHorizontal,
  Globe2,
  List,
  LockKeyhole,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { StateAuthorReadme } from '@/components/project/StateAuthorReadme';
import { StateValueReader } from '@/components/project/StateValueReader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buildStatePointRows } from '@/domain/project/stateViewModel';
import { useStateOverview } from '@/hooks/commits/useStateOverview';
import type { ApiCommit } from '@/types/api';
import { RepositoryProfileEditor } from './RepositoryProfileEditor';
import styles from './StateOverviewView.module.css';
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
  reader,
  navigation,
  headerOnly = false,
  hideHeader = false,
  historyHref,
  workspaceHref,
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
  const committedContent =
    commit?.hash === commitDigest && commit.project_id === projectId ? commit.content : null;
  const hasCommittedContent = Boolean(committedContent || reader);
  const { data, error, loading, retry } = useStateOverview(
    projectId,
    introductionSource === 'repository' && (headerOnly || hasCommittedContent) ? null : commitDigest
  );
  const [contentsOpen, setContentsOpen] = useState(false);
  const [readmeHeadings, setReadmeHeadings] = useState<string[]>([]);
  const readmeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setContentsOpen(false);
  }, [commitDigest]);

  const version = introductionSource === 'version';
  const empty = !commitDigest;
  // Historical introductions belong to this revision; never borrow current repository metadata.
  const author = version && !loading && !error ? data?.author?.document : undefined;
  const shownDescription = version ? author?.description?.trim() : projectDescription?.trim();
  const readme = version ? author?.readme : repositoryProfile.readme;
  const descriptionInReadme = readme
    ?.split(/\n\s*\n/)
    .some((paragraph) => paragraph.trim() === shownDescription);
  const shownTags = version ? (author?.tags ?? []) : repositoryProfile.tags;
  const canEdit = !version && canEditRepository && onSaveRepositoryProfile;
  const value = data?.render.model.value;
  const semantic =
    committedContent ?? (data?.reading?.kind === 'semantic-content' ? data.reading.value : null);
  const structureRows = useMemo(() => (semantic ? buildStatePointRows(semantic) : []), [semantic]);

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
    <div className={styles.root} data-testid="state-overview">
      <div className={styles.page}>
        {!hideHeader ? projectHeader : null}
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
        <div className={styles.informationLayout}>
          <div className={styles.mainColumn}>
            <section
              aria-label={version ? 'Version introduction' : 'Repository information'}
              className={styles.readmeContent}
            >
              <header className={styles.readmeHeader}>
                <h2>
                  <BookOpen aria-hidden="true" />
                  {version ? 'Version introduction' : 'README'}
                </h2>
                <div className={styles.readmeActions}>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-expanded={contentsOpen}
                    onClick={() => {
                      if (!contentsOpen)
                        setReadmeHeadings(
                          Array.from(readmeRef.current?.querySelectorAll('h1, h2, h3') ?? []).map(
                            (heading) => heading.textContent?.trim() || 'Untitled section'
                          )
                        );
                      setContentsOpen(!contentsOpen);
                    }}
                  >
                    <List aria-hidden="true" />
                    Contents
                  </Button>
                  {canEdit ? (
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
              <div ref={readmeRef} className={styles.readmeBody}>
                {version && (loading || error) ? (
                  <>
                    <p>
                      {loading
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
                  <StateAuthorReadme author={author} embedded />
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
            {reader && !empty && !stateLoading && !failed ? (
              <details className={styles.contentPreview}>
                <summary>Content preview</summary>
                <div className={styles.specializedReader}>{reader(true, () => {})}</div>
              </details>
            ) : null}
          </div>
          <aside className={styles.sidebar} aria-label="State information">
            <section
              className={styles.about}
              aria-label={version ? 'About this version' : 'About this project'}
            >
              <h2>About</h2>
              {shownDescription && !descriptionInReadme ? (
                <p className={styles.description}>{shownDescription}</p>
              ) : null}
              <fieldset
                className={styles.tags}
                aria-label={version ? 'Version tags' : 'Repository tags'}
              >
                {shownTags.map((tag) => (
                  <Badge key={tag} variant="outline" className={styles.tag}>
                    {version || tag.startsWith('#') ? tag : `#${tag}`}
                  </Badge>
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
              <dl className={styles.metadata}>
                {schemaName && !empty ? (
                  <div>
                    <dt>Schema</dt>
                    <dd>{schemaHref ? <Link href={schemaHref}>{schemaName}</Link> : schemaName}</dd>
                  </div>
                ) : null}
                {validationLabel && !empty ? (
                  <div>
                    <dt>Validation</dt>
                    <dd>{validationLabel}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
            <section aria-label="Committed State" className={styles.stateContent}>
              <header className={styles.contentHeading}>
                <h2>Structure</h2>
                {onViewStructure && !empty && !stateLoading && !failed ? (
                  <button
                    type="button"
                    className={styles.sidebarLink}
                    onClick={() => onViewStructure()}
                  >
                    Open full view <ArrowRight aria-hidden="true" />
                  </button>
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
                  <span className={styles.emptyIcon} aria-hidden="true">
                    <GitCommitHorizontal />
                  </span>
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
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
