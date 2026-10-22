'use client';

import type { RepositoryProfile, RepositoryProfilePatch } from '@t3x-dev/api-client';
import { BookOpen, ChevronRight, Globe2, List, LockKeyhole } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { StateAuthorReadme } from '@/components/project/StateAuthorReadme';
import { StateSemanticReader, StateValueReader } from '@/components/project/StateValueReader';
import { Badge } from '@/components/ui/badge';
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

export function StateOverviewView({
  projectId,
  commitDigest,
  projectName,
  projectDescription,
  projectOwner = 't3x-dev',
  projectVisibility = 'private',
  schemaName,
  schemaHref,
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
  const [selected, setSelected] = useState<string | null>(null);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [readmeHeadings, setReadmeHeadings] = useState<string[]>([]);
  const readmeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setSelected(null);
    setContentsOpen(false);
  }, [commitDigest]);

  const version = introductionSource === 'version';
  const empty = !commitDigest;
  // Historical introductions belong to this revision; never borrow current repository metadata.
  const author = version && !loading && !error ? data?.author?.document : undefined;
  const shownDescription = version ? author?.description?.trim() : projectDescription?.trim();
  const shownTags = version ? (author?.tags ?? []) : repositoryProfile.tags;
  const canEdit = !version && canEditRepository && onSaveRepositoryProfile;
  const value = data?.render.model.value;
  const semantic = data?.reading?.kind === 'semantic-content' ? data.reading.value : null;
  const items = semantic
    ? semantic.trees.map((tree, index) => ({
        key: String(index),
        label: tree.key,
        pointer: `/content/trees/${index}`,
      }))
    : (data?.summary.items ?? []).map((item) => ({ ...item, label: item.key }));

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

  const failed = stateError || error || (!empty && !loading && !data);
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
        <section aria-label="Committed State" className={styles.stateContent}>
          <header className={styles.contentHeading}>
            <h2>Overview</h2>
            {schemaName && !empty ? (
              schemaHref ? (
                <Link href={schemaHref} className={styles.schemaPill}>
                  {schemaName}
                </Link>
              ) : (
                <span className={styles.schemaPill}>{schemaName}</span>
              )
            ) : null}
          </header>
          {stateLoading || loading ? (
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
            <div className={styles.feedback}>
              <h3>No commits yet</h3>
              <p>
                This branch has no committed state yet. Use Propose change to create the first
                change in a Workspace.
              </p>
            </div>
          ) : (
            <>
              {items.length > 1 || selected !== null ? (
                <nav aria-label="State sections" className={styles.sectionLinks}>
                  {selected !== null ? (
                    <button type="button" onClick={() => setSelected(null)}>
                      ← All sections
                    </button>
                  ) : null}
                  {items.map((item) => (
                    <button
                      key={item.pointer}
                      type="button"
                      aria-pressed={selected === item.key}
                      onClick={() => setSelected(item.key)}
                    >
                      {displayName(item.label || '(empty key)')}
                    </button>
                  ))}
                </nav>
              ) : null}
              <div
                id="overview-render-content"
                className={
                  reader && selected === null ? styles.specializedReader : styles.renderedContent
                }
              >
                {reader && selected === null ? (
                  reader(true, () => setSelected(null))
                ) : semantic ? (
                  <StateSemanticReader
                    compact
                    trees={selected === null ? semantic.trees : [semantic.trees[Number(selected)]]}
                  />
                ) : selected !== null &&
                  value !== null &&
                  typeof value === 'object' &&
                  Object.hasOwn(value, selected) ? (
                  <StateValueReader compact value={(value as Record<string, unknown>)[selected]} />
                ) : (
                  <StateValueReader compact value={value} />
                )}
              </div>
            </>
          )}
        </section>

        <details className={styles.readmeDisclosure}>
          <summary>
            <BookOpen aria-hidden="true" />
            {version ? 'Version introduction' : 'README & repository information'}
          </summary>
          <section
            aria-label={version ? 'Version introduction' : 'Repository information'}
            className={styles.readmeContent}
          >
            {shownDescription ? <p className={styles.description}>{shownDescription}</p> : null}
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
            <div className={styles.readmeHeader}>
              <h2>{version ? 'Version README' : 'README'}</h2>
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
            <div ref={readmeRef} className={styles.readmeBody}>
              {version && (loading || error) ? (
                <p>
                  {loading ? 'Loading version introduction…' : 'Version introduction unavailable.'}
                </p>
              ) : version ? (
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
        </details>
      </div>
    </div>
  );
}
