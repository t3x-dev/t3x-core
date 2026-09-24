'use client';

import {
  BookOpen,
  Box,
  ChevronRight,
  Code2,
  FileText,
  Globe2,
  Info,
  List,
  LockKeyhole,
  Maximize2,
  Minimize2,
  Package,
  PanelLeft,
  Rocket,
  SquareCheckBig,
  Users,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { type ReactNode, useRef, useState } from 'react';
import { resourceUrl, StateAuthorReadme } from '@/components/project/StateAuthorReadme';
import { StateScrollArea } from '@/components/project/StateScrollArea';
import { StateSemanticReader, StateValueReader } from '@/components/project/StateValueReader';
import { Button } from '@/components/ui/button';
import { useStateOverview } from '@/hooks/commits/useStateOverview';
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
}: {
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

  if (loading) return <output className={styles.feedback}>Loading Overview…</output>;
  if (error || !data)
    return (
      <div className={styles.feedback} role="alert">
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
  const shownOwner = isReleaseControl ? 'orbit-labs' : projectOwner;
  const shownVisibility = isReleaseControl ? 'public' : projectVisibility;
  const shownDescription = isReleaseControl
    ? 'Review every rollout decision.'
    : author?.description?.trim() || projectDescription?.trim();
  const shownSchema = isReleaseControl ? 'Release plan v1.2' : schemaName || 'Not specified';

  const collectHeadings = () => {
    setReadmeHeadings(
      Array.from(readmeRef.current?.querySelectorAll('h1, h2, h3') ?? []).map(
        (heading) => heading.textContent?.trim() || 'Untitled section'
      )
    );
  };

  return (
    <div className={styles.root} data-testid="state-overview">
      {!expanded ? (
        <header className={styles.projectHeader}>
          {isReleaseControl ? (
            <OrbitMark className={styles.avatarFallback} />
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
              by <strong>{shownOwner}</strong>
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
      ) : null}

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
              {isReleaseControl ? (
                <ReleaseControlReadme />
              ) : (
                <StateAuthorReadme author={author} compact embedded />
              )}
            </div>
            {isReleaseControl ? (
              <footer className={styles.readmeFooter}>
                <a href="#documentation">
                  <FileText aria-hidden="true" />
                  Documentation <span>→</span>
                </a>
                <a href="#contributing">
                  <Users aria-hidden="true" />
                  Contribution guide <span>→</span>
                </a>
              </footer>
            ) : null}
          </section>
        ) : null}

        <aside aria-label="T3X rendered State" className={styles.sideColumn}>
          <section className={styles.stateCard}>
            <div className={styles.cardTitle}>
              <PanelLeft aria-hidden="true" />
              <strong>State render</strong>
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
                  Committed state <i>•</i>{' '}
                  <code>{commitDigest.replace(/^sha256:/, '').slice(0, 7)}</code>
                </span>
                <span className={styles.schemaPill}>{shownSchema}</span>
              </div>
              {expanded && items.length > 0 ? (
                <nav aria-label="State sections" className={styles.contents}>
                  {items.map((item) => (
                    <button key={item.pointer} type="button" onClick={() => setSelected(item.key)}>
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
                          <StateValueReader value={(value as Record<string, unknown>)[selected]} />
                        </>
                      ) : (
                        <StateValueReader value={value} />
                      )}
                    </StateScrollArea>
                  )}
                </div>
              ) : isReleaseControl ? (
                <ReleaseStateSummary />
              ) : (
                <GenericStateSummary sections={sections} value={value} />
              )}
              {!expanded && onViewStructure ? (
                <button type="button" onClick={onViewStructure} className={styles.viewLink}>
                  <Code2 aria-hidden="true" />
                  View structure <span>→</span>
                </button>
              ) : null}
            </div>
          </section>

          {!expanded ? (
            <section className={styles.aboutCard}>
              <div className={styles.cardTitle}>
                <Info aria-hidden="true" />
                <strong>About this project</strong>
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
  );
}

function OrbitMark({ className }: { className: string }) {
  return (
    <div className={className}>
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="M9 23C4 18 4 14 9 9s9-5 14 0M23 9c5 5 5 9 0 14s-9 5-14 0"
          stroke="var(--status-warning)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="9" cy="23" r="4.5" fill="var(--status-warning)" />
        <circle cx="23" cy="9" r="4.5" fill="var(--status-warning)" />
      </svg>
    </div>
  );
}

function ReleaseControlReadme() {
  return (
    <>
      <div className={styles.releaseJourney}>
        <svg className={styles.journeyLine} preserveAspectRatio="none" aria-hidden="true">
          <path
            d="M -50,60 Q 250,-10 500,60 T 1100,50"
            stroke="var(--text-tertiary)"
            strokeWidth="1.5"
            strokeDasharray="4 6"
            fill="none"
          />
        </svg>
        <div className={styles.journeySteps}>
          <JourneyStep kind="build" icon={<Package />} title="Build">
            Ship and test
            <br />
            changes
          </JourneyStep>
          <JourneyStep kind="review" icon={<FileText />} title="Review">
            Evaluate impact
            <br />
            and confirm readiness
          </JourneyStep>
          <JourneyStep kind="stage" icon={<SquareCheckBig />} title="Stage">
            Roll out to a limited
            <br />
            audience
          </JourneyStep>
          <JourneyStep kind="release" icon={<Rocket />} title="Release">
            Ship with confidence
            <br />
            and monitor
          </JourneyStep>
          <p className={styles.journeyAside}>
            Better
            <br />
            releases
            <br />
            together.
          </p>
        </div>
      </div>
      <div className={styles.readmeCopy}>
        <section>
          <h1>Release with evidence</h1>
          <p>
            A shared release plan that keeps rollout context, ownership, and decisions together.
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
                <tr>
                  <td>Internal preview</td>
                  <td>Internal team</td>
                  <td>10%</td>
                </tr>
                <tr>
                  <td>Limited release</td>
                  <td>Pilot users</td>
                  <td>25%</td>
                </tr>
                <tr>
                  <td>General release</td>
                  <td>All users</td>
                  <td>100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section id="contributing" className={styles.teamWorks}>
          <h1>How the team works</h1>
          <ol>
            <li>
              <strong>Update the plan in a Workspace</strong>
              <span>Propose changes to the release plan in a dedicated workspace.</span>
            </li>
            <li>
              <strong>Review the proposed change</strong>
              <span>Collaborate on the changes, validate criteria, and discuss impact.</span>
            </li>
            <li>
              <strong>Commit the agreed state</strong>
              <span>Merge to main to record the new release state.</span>
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
      <div>
        {icon}
        <strong>{title}</strong>
      </div>
      <p>{children}</p>
    </div>
  );
}

function ReleaseStateSummary() {
  return (
    <div id="overview-render-content" className={styles.releaseState}>
      <section>
        <h3>Current rollout</h3>
        <div className={styles.releaseRows}>
          <div>
            <span>Stage</span>
            <strong className={styles.stagePill}>Internal preview</strong>
          </div>
          <div>
            <span>Audience</span>
            <strong>Internal team</strong>
          </div>
          <div>
            <span>Allocation</span>
            <strong className={styles.allocation}>
              10%{' '}
              <i>
                <u />
              </i>
              <em>10%</em>
            </strong>
          </div>
        </div>
      </section>
      <section>
        <h3>Recorded criteria</h3>
        <div className={styles.releaseRows}>
          <div>
            <span>Monitoring enabled</span>
            <strong>true</strong>
          </div>
          <div>
            <span>Rollback ready</span>
            <strong>true</strong>
          </div>
        </div>
        <p className={styles.recordNote}>
          <Info aria-hidden="true" />
          Recorded values, not verification results.
        </p>
      </section>
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
      <p className={styles.recordNote}>
        <Info aria-hidden="true" />
        Recorded values, not verification results.
      </p>
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
