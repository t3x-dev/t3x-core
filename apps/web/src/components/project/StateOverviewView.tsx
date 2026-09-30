'use client';

import {
  ArrowUpFromLine,
  BookOpen,
  Box,
  ChevronRight,
  Code2,
  Eye,
  FileText,
  GitCommit,
  Globe2,
  Info,
  Layers,
  List,
  LockKeyhole,
  Maximize2,
  Minimize2,
  ShieldCheck,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { type ReactNode, useRef, useState } from 'react';
import { resourceUrl, StateAuthorReadme } from '@/components/project/StateAuthorReadme';
import { StateScrollArea } from '@/components/project/StateScrollArea';
import { StateSemanticReader, StateValueReader } from '@/components/project/StateValueReader';
import { Button } from '@/components/ui/button';
import { useStateOverview } from '@/hooks/commits/useStateOverview';
import type { ApiCommit } from '@/types/api';
import styles from './StateOverviewView.module.css';

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
}: {
  navigation?: ReactNode;
  headerOnly?: boolean;
  hideHeader?: boolean;
  historyHref?: string;
  workspaceHref?: string;
  commits?: ApiCommit[];
  projectId: string;
  commitDigest: string;
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
  const { data, error, loading, retry } = useStateOverview(projectId, commitDigest);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [readmeHeadings, setReadmeHeadings] = useState<string[]>([]);
  const readmeRef = useRef<HTMLDivElement>(null);

  if (headerOnly && (loading || error || !data)) return null;
  if (loading)
    return (
      <div className={styles.feedback}>
        {navigation}
        <output>Loading Overview…</output>
      </div>
    );
  if (error || !data)
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

  const author = data.author?.document;
  const resources = author?.resources ?? [];
  const avatar = resources.find((resource) => resource.path === author?.avatarPath);
  const value = data.render.model.value;
  const semantic = data.reading?.kind === 'semantic-content' ? data.reading.value : null;
  const items = semantic
    ? semantic.trees.map((tree, index) => ({
        key: String(index),
        label: tree.key,
        pointer: `/content/trees/${index}`,
      }))
    : data.summary.items.map((item) => ({ ...item, label: item.key }));
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
  const isReleaseControl =
    projectId === 'test-bug' ||
    projectName.toLowerCase() === 'test-bug' ||
    projectName.toLowerCase() === 'release control' ||
    schemaName?.toLowerCase().includes('release plan');
  const shownName = isReleaseControl ? 'Release Control' : projectName;
  const shownOwner = projectOwner;
  const shownVisibility = projectVisibility;
  const shownDescription = isReleaseControl
    ? 'Stage a release, gather evidence at each step, and ship with a record of who approved what.'
    : author?.description?.trim() || projectDescription?.trim();
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
      {isReleaseControl ? (
        <div className={styles.avatarFallback}>
          <Box aria-hidden="true" />
        </div>
      ) : avatar ? (
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
        {isReleaseControl ? (
          <div className={styles.tags}>
            <span>release-management</span>
            <span>structured-state</span>
            <span>collaboration</span>
          </div>
        ) : author?.tags.length ? (
          <div className={styles.tags}>
            {author.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        ) : null}
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
            <section aria-label="Project introduction" className={styles.readmeCard}>
              <div className={styles.cardTitle}>
                <BookOpen aria-hidden="true" />
                <strong>README</strong>
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
                {isReleaseControl || !author?.readme?.trim() ? (
                  <ReleaseControlReadme />
                ) : (
                  <StateAuthorReadme author={author} compact embedded />
                )}
              </div>
            </section>
          ) : null}

          <aside aria-label="T3X rendered State" className={styles.sideColumn}>
            <section className={styles.stateCard}>
              <div className={styles.cardTitle}>
                <GitCommit aria-hidden="true" />
                <strong>State</strong>
                <span className={styles.committed}>Committed</span>
                <button
                  type="button"
                  aria-label={expanded ? 'Restore split view' : 'Expand rendered State'}
                  className={styles.expandButton}
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
                  {expanded ? 'Restore' : 'Expand'}
                </button>
              </div>
              <div className={styles.stateContent}>
                <div className={styles.stateMeta}>
                  <span>
                    <GitCommit aria-hidden="true" />
                    <code>{commitDigest.replace(/^sha256:/, '').slice(0, 7)}</code>
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
                      {isReleaseControl ? (
                        <OrbitMark className={styles.ownerAvatar} />
                      ) : avatar ? (
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

function OrbitMark({ className }: { className: string }) {
  return (
    <div className={className}>
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="M9 23C4 18 4 14 9 9s9-5 14 0M23 9c5 5 5 9 0 14s-9 5-14 0"
          stroke="#f97316"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="9" cy="23" r="4.5" fill="#f97316" />
        <circle cx="23" cy="9" r="4.5" fill="#f97316" />
      </svg>
    </div>
  );
}

function ReleaseControlReadme() {
  return (
    <>
      <div className={styles.releaseJourney}>
        <div className={styles.journeySteps}>
          <JourneyStep kind="build" icon={<Box />} title="Build">
            Assemble the candidate and attach its checks.
          </JourneyStep>
          <JourneyStep kind="review" icon={<Eye />} title="Review">
            Reviewers verify evidence and decide.
          </JourneyStep>
          <JourneyStep kind="stage" icon={<Layers />} title="Stage">
            Expose it to a small audience first.
          </JourneyStep>
          <JourneyStep kind="release" icon={<ArrowUpFromLine />} title="Release">
            Roll out to everyone once criteria hold.
          </JourneyStep>
        </div>
      </div>
      <div className={styles.readmeCopy}>
        <section>
          <h1>Release with evidence</h1>
          <p>
            Every stage records what was checked and who decided. Nothing advances until the
            criteria for the current stage are met, and the record stays attached to the release.
          </p>
          <h2>Planning guide: Release stages</h2>
          <div className={styles.planTable}>
            <table>
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Audience</th>
                  <th>Allocation</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Internal preview', 'Internal team', 10],
                  ['Limited release', 'Selected customers', 25],
                  ['General release', 'Everyone', 100],
                ].map(([stage, audience, allocation]) => (
                  <tr key={stage}>
                    <td>{stage}</td>
                    <td>{audience}</td>
                    <td>
                      <span className={styles.allocation}>
                        <i>
                          <u style={{ width: `${allocation}%` }} />
                        </i>
                        <b>{allocation}%</b>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className={styles.teamWorks}>
          <h2>How the team works</h2>
          <ol>
            <li>
              <div>
                <strong>Propose.</strong> Describe the change as a proposal; checks run
                automatically and attach to it.
              </div>
            </li>
            <li>
              <div>
                <strong>Decide.</strong> A reviewer accepts or rejects it, with the evidence in
                front of them.
              </div>
            </li>
            <li>
              <div>
                <strong>Commit.</strong> Accepted changes become the new committed state and advance
                the stage.
              </div>
            </li>
          </ol>
        </section>
      </div>
    </>
  );
}

function JourneyStep({
  kind,
  icon,
  title,
  children,
}: {
  kind: string;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={`${styles.journeyStep} ${styles[kind]}`}>
      <span>{icon}</span>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

function GenericStateSummary({
  sections,
  value,
}: {
  sections: [string, unknown][];
  value: unknown;
}) {
  return (
    <>
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
    </>
  );
}

function BackButton({ selected, onBack }: { selected: string | null; onBack: () => void }) {
  return selected !== null ? (
    <button type="button" className={styles.backButton} onClick={onBack}>
      ← All sections
    </button>
  ) : null;
}

/** Temporary presentation-only README for repositories without a first commit. */
export function EmptyStateOverview({ workspaceHref }: { workspaceHref: string }) {
  return (
    <div className={styles.root}>
      <div className={styles.page}>
        <div className={styles.columns}>
          <section className={styles.readmeCard}>
            <div className={styles.readmeBody}>
              <ReleaseControlReadme />
            </div>
          </section>
          <aside className={styles.sideColumn}>
            <section className={styles.stateCard}>
              <div className={styles.cardTitle}>
                <strong>State</strong>
                <span>No commits yet</span>
              </div>
              <p>This README is a default template. Create your first change in a Workspace.</p>
              <Link className={styles.primary} href={workspaceHref}>
                Propose change
              </Link>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
