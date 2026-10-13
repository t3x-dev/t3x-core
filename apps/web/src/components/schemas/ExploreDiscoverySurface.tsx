'use client';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef } from 'react';
import { useProjectStore } from '@/store/projectStore';
import { DiscoverCover } from './DiscoverCover';
import { cx, ReferenceIcon } from './DiscoverReference';
import styles from './ExploreDiscoverySurface.module.css';

// Editorial sample content is retained from the supplied design, not live catalog metrics.
export function ExploreDiscoverySurface({
  hideNavigation = false,
  onBrowse: browse,
  onSearch,
  onStudio: studio,
  onImport: importSchema,
}: {
  hideNavigation?: boolean;
  onBrowse?: () => void;
  onSearch?: (query: string) => void;
  onStudio?: () => void;
  onImport?: () => void;
}) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      const target = event.target;
      if (
        event.key !== '/' ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        (target instanceof HTMLElement &&
          (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))
      )
        return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    document.addEventListener('keydown', focusSearch);
    return () => document.removeEventListener('keydown', focusSearch);
  }, []);
  const projectId = useProjectStore((state) => state.projects[0]?.id);
  const catalogPath = projectId ? `/project/${encodeURIComponent(projectId)}?tab=schemas` : null;
  const onBrowse =
    browse ?? (() => router.push(catalogPath ? `${catalogPath}&schemaView=browse` : '/'));
  const onStudio =
    studio ?? (() => router.push(catalogPath ? `${catalogPath}&schemaView=studio` : '/'));
  const onImport = importSchema ?? onStudio;
  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get('q') ?? '').trim();
    if (onSearch) onSearch(query);
    else
      router.push(
        catalogPath ? `${catalogPath}&schemaView=browse&q=${encodeURIComponent(query)}` : '/'
      );
  }
  return (
    <div className={styles.surface} data-content="editorial-preview">
      <main className={cx('page')}>
        <div className={cx('ptitle')}>
          <div className={cx('grow')}></div>
          <div className={cx('stats')}>
            <div>
              <b>128</b>
              <span>Public schemas</span>
            </div>
            <div>
              <b>6</b>
              <span>In use here</span>
            </div>
            <div>
              <b>3</b>
              <span>Updates available</span>
            </div>
          </div>
          <button type="button" className={cx('btn lg')} onClick={onImport}>
            <ReferenceIcon name="download" size={14} weight={1.75} />
            Import
          </button>
          <button type="button" className={cx('btn lg primary')} onClick={onStudio}>
            <ReferenceIcon name="plus" size={14} weight={2.25} />
            New schema
          </button>
        </div>

        {!hideNavigation ? (
          <div className={cx('tool nw')}>
            <nav className={cx('modes')} aria-label="Schema views">
              <button type="button" aria-current="page">
                <span className={cx('on')}>
                  <ReferenceIcon name="compass" size={14} weight={1.75} />
                  Discover
                </span>
              </button>
              <button type="button" onClick={onBrowse}>
                <span>
                  <ReferenceIcon name="grid" size={14} weight={1.75} />
                  Browse
                </span>
              </button>
              <button type="button" onClick={onStudio}>
                <span>
                  <ReferenceIcon name="pencil" size={14} weight={1.75} />
                  Studio
                </span>
              </button>
            </nav>
            <form className={cx('find')} onSubmit={submitSearch}>
              <ReferenceIcon name="search" size={15} weight={1.75} />
              <input
                className={cx('grow')}
                ref={searchRef}
                name="q"
                aria-label="Search projects and schemas"
                placeholder="Search projects and schemas…"
                type="search"
              />
              <span className={cx('kbd')}>/</span>
            </form>
            <div className={cx('scope')}>
              <span>All</span>
              <span>Projects</span>
              <span className={cx('on')}>Schemas</span>
            </div>
            <button type="button" className={cx('dd')} onClick={onBrowse}>
              <ReferenceIcon name="filter" size={14} weight={1.75} />
              Filters
            </button>
            <button type="button" className={cx('dd')} onClick={onBrowse}>
              Most used
              <ReferenceIcon name="down" size={12} weight={1.75} className={cx('tx3')} />
            </button>
          </div>
        ) : null}

        <div className={cx('sh')}>
          <h2>Curated schemas</h2>
          <span className={cx('pill blue')} style={{ height: '20px' }}>
            Ready to use
          </span>
          <div className={cx('grow')}></div>
          <button type="button" className={cx('more')} onClick={onBrowse}>
            View all 12
            <ReferenceIcon name="arrowr" size={13} weight={1.75} />
          </button>
        </div>
        <div className={cx('cards')}>
          <article className={cx('card hot')}>
            <DiscoverCover kind="release" />
            <div className={cx('cb')}>
              <span className={cx('ico o')}>
                <ReferenceIcon name="box" size={18} weight={1.75} />
              </span>
              <div className={cx('ct')}>
                <h3>Release plan</h3>
                <span className={cx('ver')}>v1.2</span>
                <span className={cx('by')}>orbit-labs</span>
              </div>
              <p className={cx('cd')}>
                Stages, rollback windows and approvers for shipping a service safely.
              </p>
              <div className={cx('cf')}>
                <span className={cx('tg')} style={{ display: 'flex', gap: '4px' }}>
                  <span className={cx('pill')} style={{ height: '20px' }}>
                    overview
                  </span>
                  <span className={cx('pill')} style={{ height: '20px' }}>
                    rollout
                  </span>
                </span>
                <span className={cx('mt')} style={{ marginLeft: 'auto' }}>
                  <ReferenceIcon name="download" size={12} weight={1.75} />
                  1.8k
                </span>
                <button type="button" className={cx('use')} onClick={onBrowse}>
                  <ReferenceIcon name="plus" size={12} weight={2.25} />
                  Use
                </button>
              </div>
            </div>
          </article>
          <article className={cx('card')}>
            <DiscoverCover kind="circuit" />
            <div className={cx('cb')}>
              <span className={cx('ico g')}>
                <ReferenceIcon name="layers" size={18} weight={1.75} />
              </span>
              <div className={cx('ct')}>
                <h3>Service contract</h3>
                <span className={cx('ver')}>v2.0</span>
                <span className={cx('by')}>greenfield</span>
              </div>
              <p className={cx('cd')}>
                Interfaces, SLOs and consumers for internal services, with drift checks.
              </p>
              <div className={cx('cf')}>
                <span style={{ display: 'flex', gap: '4px' }}>
                  <span className={cx('pill')} style={{ height: '20px' }}>
                    services
                  </span>
                  <span className={cx('pill')} style={{ height: '20px' }}>
                    slo
                  </span>
                </span>
                <span className={cx('mt')} style={{ marginLeft: 'auto' }}>
                  <ReferenceIcon name="download" size={12} weight={1.75} />
                  1.2k
                </span>
                <span className={cx('use ghost')}>
                  <ReferenceIcon name="check" size={12} weight={2.25} />
                  In use
                </span>
              </div>
            </div>
          </article>
          <article className={cx('card')}>
            <DiscoverCover kind="agent" />
            <div className={cx('cb')}>
              <span className={cx('ico v')}>
                <ReferenceIcon name="sparkles" size={18} weight={1.75} />
              </span>
              <div className={cx('ct')}>
                <h3>Agent policy</h3>
                <span className={cx('ver')}>v0.9</span>
                <span className={cx('by')}>lumen</span>
              </div>
              <p className={cx('cd')}>
                Goals, tool permissions and guardrails for production agents.
              </p>
              <div className={cx('cf')}>
                <span style={{ display: 'flex', gap: '4px' }}>
                  <span className={cx('pill')} style={{ height: '20px' }}>
                    agents
                  </span>
                  <span className={cx('pill')} style={{ height: '20px' }}>
                    policy
                  </span>
                </span>
                <span className={cx('mt')} style={{ marginLeft: 'auto' }}>
                  <ReferenceIcon name="download" size={12} weight={1.75} />
                  640
                </span>
                <button type="button" className={cx('use')} onClick={onBrowse}>
                  <ReferenceIcon name="plus" size={12} weight={2.25} />
                  Use
                </button>
              </div>
            </div>
          </article>
        </div>

        <div className={cx('cols')}>
          <section>
            <div className={cx('sh')} style={{ marginTop: '0' }}>
              <h2>Discover</h2>
              <div className={cx('tabsx')}>
                <span className={cx('on')}>Popular</span>
                <span>Recently updated</span>
                <span>Following</span>
              </div>
              <div className={cx('grow')}></div>
              <button type="button" className={cx('more')} onClick={onBrowse}>
                Browse all
                <ReferenceIcon name="arrowr" size={13} weight={1.75} />
              </button>
            </div>
            <div className={cx('lh nw')}>
              <span></span>
              <span>SCHEMA</span>
              <span>TAGS</span>
              <span>VERSION</span>
              <span>AUTHOR</span>
              <span style={{ textAlign: 'right' }}>USES</span>
            </div>
            <div className={cx('lr nw')}>
              <span className={cx('ico sm b')}>
                <ReferenceIcon name="db" size={16} weight={1.75} />
              </span>
              <div className={cx('ell')}>
                <div className={cx('nm')}>
                  Data catalog<span className={cx('new')}>NEW</span>
                </div>
                <div className={cx('ds ell')}>Datasets, owners and lineage in one register</div>
              </div>
              <div className={cx('tg')}>
                <span>data</span>
                <span>governance</span>
              </div>
              <span className={cx('ver')}>v1.0</span>
              <div className={cx('au')}>
                <i className={cx('a')} style={{ background: '#3b82f6' }}>
                  N
                </i>
                northwind
              </div>
              <div className={cx('us')}>2.4k</div>
            </div>
            <div className={cx('lr hov nw')}>
              <span className={cx('ico sm r')}>
                <ReferenceIcon name="alert" size={16} weight={1.75} />
              </span>
              <div className={cx('ell')}>
                <div className={cx('nm')}>Incident report</div>
                <div className={cx('ds ell')}>Timeline, impact, root cause and follow-ups</div>
              </div>
              <div className={cx('tg')}>
                <span>ops</span>
                <span>postmortem</span>
              </div>
              <span className={cx('ver')}>v1.4</span>
              <div className={cx('au')}>
                <i className={cx('a')} style={{ background: '#e5484d' }}>
                  S
                </i>
                sre-guild
              </div>
              <div className={cx('us')}>2.1k</div>
            </div>
            <div className={cx('lr nw')}>
              <span className={cx('ico sm t')}>
                <ReferenceIcon name="file" size={16} weight={1.75} />
              </span>
              <div className={cx('ell')}>
                <div className={cx('nm')}>PRD Schema</div>
                <div className={cx('ds ell')}>
                  Requirements with owners, priority and acceptance
                </div>
              </div>
              <div className={cx('tg')}>
                <span>product</span>
                <span>requirements</span>
              </div>
              <span className={cx('ver')}>v2.0</span>
              <div className={cx('au')}>
                <i className={cx('a')} style={{ background: '#0d9488' }}>
                  T
                </i>
                t3x-dev
              </div>
              <div className={cx('us')}>1.9k</div>
            </div>
            <div className={cx('lr nw')}>
              <span className={cx('ico sm k')}>
                <ReferenceIcon name="terminal" size={16} weight={1.75} />
              </span>
              <div className={cx('ell')}>
                <div className={cx('nm')}>Runbook</div>
                <div className={cx('ds ell')}>Steps, preconditions and escalation paths</div>
              </div>
              <div className={cx('tg')}>
                <span>ops</span>
                <span>on-call</span>
              </div>
              <span className={cx('ver')}>v1.1</span>
              <div className={cx('au')}>
                <i className={cx('a')} style={{ background: '#475569' }}>
                  S
                </i>
                sre-guild
              </div>
              <div className={cx('us')}>1.4k</div>
            </div>
            <div className={cx('lr nw')}>
              <span className={cx('ico sm y')}>
                <ReferenceIcon name="branch" size={16} weight={1.75} />
              </span>
              <div className={cx('ell')}>
                <div className={cx('nm')}>API changelog</div>
                <div className={cx('ds ell')}>Versioned changes with breaking-change flags</div>
              </div>
              <div className={cx('tg')}>
                <span>api</span>
                <span>release</span>
              </div>
              <span className={cx('ver')}>v1.3</span>
              <div className={cx('au')}>
                <i className={cx('a')} style={{ background: '#d69e2e' }}>
                  O
                </i>
                orbit-labs
              </div>
              <div className={cx('us')}>1.1k</div>
            </div>
            <div className={cx('lr nw')}>
              <span className={cx('ico sm p')}>
                <ReferenceIcon name="settings" size={16} weight={1.75} />
              </span>
              <div className={cx('ell')}>
                <div className={cx('nm')}>Feature flag</div>
                <div className={cx('ds ell')}>Rollout rules, owners and expiry dates</div>
              </div>
              <div className={cx('tg')}>
                <span>release</span>
                <span>config</span>
              </div>
              <span className={cx('ver')}>v0.8</span>
              <div className={cx('au')}>
                <i className={cx('a')} style={{ background: '#d6409f' }}>
                  L
                </i>
                lumen
              </div>
              <div className={cx('us')}>920</div>
            </div>
            <div className={cx('lr nw')}>
              <span className={cx('ico sm v')}>
                <ReferenceIcon name="eye" size={16} weight={1.75} />
              </span>
              <div className={cx('ell')}>
                <div className={cx('nm')}>Model card</div>
                <div className={cx('ds ell')}>Intended use, evaluation and known limits</div>
              </div>
              <div className={cx('tg')}>
                <span>ml</span>
                <span>evaluation</span>
              </div>
              <span className={cx('ver')}>v1.0</span>
              <div className={cx('au')}>
                <i className={cx('a')} style={{ background: '#7c5cf0' }}>
                  L
                </i>
                lumen
              </div>
              <div className={cx('us')}>780</div>
            </div>
            <div className={cx('lr nw')}>
              <span className={cx('ico sm g')}>
                <ReferenceIcon name="shield" size={16} weight={1.75} />
              </span>
              <div className={cx('ell')}>
                <div className={cx('nm')}>Access review</div>
                <div className={cx('ds ell')}>Roles, grants and quarterly attestations</div>
              </div>
              <div className={cx('tg')}>
                <span>security</span>
                <span>audit</span>
              </div>
              <span className={cx('ver')}>v1.2</span>
              <div className={cx('au')}>
                <i className={cx('a')} style={{ background: '#22a05a' }}>
                  G
                </i>
                greenfield
              </div>
              <div className={cx('us')}>610</div>
            </div>
          </section>

          <aside className={cx('rail')}>
            <div className={cx('panel')}>
              <div className={cx('ph')}>
                <ReferenceIcon name="trend" size={15} weight={1.75} className={cx('ok')} />
                Trending this week
              </div>
              <div className={cx('pk')}>
                <span className={cx('rk')}>1</span>
                <span className={cx('ico sm o')}>
                  <ReferenceIcon name="box" size={16} weight={1.75} />
                </span>
                <div className={cx('ell')}>
                  <div className={cx('nm')}>Release plan</div>
                  <div className={cx('ds ell')}>+312 uses</div>
                </div>
                <span className={cx('spark')}>
                  <i style={{ height: '6px' }}></i>
                  <i style={{ height: '8px' }}></i>
                  <i style={{ height: '7px' }}></i>
                  <i style={{ height: '11px' }}></i>
                  <i style={{ height: '13px' }} className={cx('h')}></i>
                  <i style={{ height: '18px' }} className={cx('h')}></i>
                </span>
              </div>
              <div className={cx('pk hov')}>
                <span className={cx('rk')}>2</span>
                <span className={cx('ico sm v')}>
                  <ReferenceIcon name="sparkles" size={16} weight={1.75} />
                </span>
                <div className={cx('ell')}>
                  <div className={cx('nm')}>Agent policy</div>
                  <div className={cx('ds ell')}>+204 uses</div>
                </div>
                <span className={cx('spark')}>
                  <i style={{ height: '4px' }}></i>
                  <i style={{ height: '5px' }}></i>
                  <i style={{ height: '9px' }}></i>
                  <i style={{ height: '8px' }}></i>
                  <i style={{ height: '14px' }} className={cx('h')}></i>
                  <i style={{ height: '16px' }} className={cx('h')}></i>
                </span>
              </div>
              <div className={cx('pk')}>
                <span className={cx('rk')}>3</span>
                <span className={cx('ico sm g')}>
                  <ReferenceIcon name="layers" size={16} weight={1.75} />
                </span>
                <div className={cx('ell')}>
                  <div className={cx('nm')}>Service contract</div>
                  <div className={cx('ds ell')}>+171 uses</div>
                </div>
                <span className={cx('spark')}>
                  <i style={{ height: '9px' }}></i>
                  <i style={{ height: '10px' }}></i>
                  <i style={{ height: '8px' }}></i>
                  <i style={{ height: '12px' }}></i>
                  <i style={{ height: '11px' }} className={cx('h')}></i>
                  <i style={{ height: '13px' }} className={cx('h')}></i>
                </span>
              </div>
              <div className={cx('pk')}>
                <span className={cx('rk')}>4</span>
                <span className={cx('ico sm b')}>
                  <ReferenceIcon name="db" size={16} weight={1.75} />
                </span>
                <div className={cx('ell')}>
                  <div className={cx('nm')}>Data catalog</div>
                  <div className={cx('ds ell')}>+118 uses</div>
                </div>
                <span className={cx('spark')}>
                  <i style={{ height: '5px' }}></i>
                  <i style={{ height: '6px' }}></i>
                  <i style={{ height: '6px' }}></i>
                  <i style={{ height: '8px' }}></i>
                  <i style={{ height: '9px' }} className={cx('h')}></i>
                  <i style={{ height: '12px' }} className={cx('h')}></i>
                </span>
              </div>
            </div>
            <div>
              <div className={cx('sh')} style={{ margin: '0 0 10px' }}>
                <h2 style={{ fontSize: '13px' }}>Updates for you</h2>
                <span className={cx('pill orange')} style={{ height: '18px', fontSize: '10.5px' }}>
                  3
                </span>
              </div>
              <div className={cx('recent')}>
                <div className={cx('rc')}>
                  <span className={cx('d')}>
                    <ReferenceIcon name="history" size={12} weight={1.75} />
                  </span>
                  <div>
                    <b>Service contract</b> v2.0 adds drift checks
                    <time>Used in 2 of your projects · 2 h ago</time>
                  </div>
                </div>
                <div className={cx('rc')}>
                  <span className={cx('d')}>
                    <ReferenceIcon name="history" size={12} weight={1.75} />
                  </span>
                  <div>
                    <b>PRD Schema</b> v2.0 made <b>owner</b> required
                    <time>Used in test-bug · yesterday</time>
                  </div>
                </div>
                <div className={cx('rc')}>
                  <span className={cx('d')}>
                    <ReferenceIcon name="history" size={12} weight={1.75} />
                  </span>
                  <div>
                    <b>Runbook</b> v1.1 adds escalation paths<time>Sep 26</time>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
