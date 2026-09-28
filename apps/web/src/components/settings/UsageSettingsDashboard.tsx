'use client';

import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronDown,
  FileText,
  Minus,
  Package,
  RefreshCw,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  type UsageModelRow,
  type UsageSummaryRow,
  useUsageSettings,
} from '@/hooks/settings/useUsageSettings';
import styles from './UsageSettingsDashboard.module.css';

const RANGE_OPTIONS = [7, 30, 90] as const;

function compactNumber(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K`;
  return value.toLocaleString('en-US');
}

function shortDate(value: Date): string {
  return value.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function modelDisplayName(model: string): string {
  return model
    .replace(/-\d{8}$/u, '')
    .split(/[-_/]/u)
    .filter(Boolean)
    .map((part) =>
      part.toLowerCase() === 'gpt' ? 'GPT' : `${part[0]?.toUpperCase()}${part.slice(1)}`
    )
    .join(' ');
}

function modelProvider(model: string): string {
  const value = model.toLowerCase();
  if (value.includes('claude')) return 'Anthropic';
  if (value.includes('gpt') || value.includes('o1')) return 'OpenAI';
  if (value.includes('gemini')) return 'Google';
  return 'Connected provider';
}

function percentageChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}

function chartRows(rows: UsageSummaryRow[], days: number): UsageSummaryRow[] {
  const byDay = new Map(rows.map((row) => [row.period.slice(0, 10), row]));
  const end = new Date();
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(end);
    date.setHours(0, 0, 0, 0);
    date.setDate(end.getDate() - days + index + 1);
    const key = date.toISOString().slice(0, 10);
    return (
      byDay.get(key) ?? {
        period: date.toISOString(),
        requests: 0,
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost: 0,
      }
    );
  });
}

export function UsageSettingsDashboard() {
  const [days, setDays] = useState<(typeof RANGE_OPTIONS)[number]>(30);
  const [rangeOpen, setRangeOpen] = useState(false);
  const { data, previousData, error, loading, retry } = useUsageSettings(days);
  const rows = useMemo(() => chartRows(data?.summary ?? [], days), [data?.summary, days]);
  const models = data?.by_model ?? [];
  const total = data?.total ?? { requests: 0, input_tokens: 0, output_tokens: 0 };

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/settings">Settings</Link>
          <span>/</span>
          <strong>Usage</strong>
        </nav>

        <div className={styles.titleRow}>
          <div className={styles.titleGroup}>
            <h1>Usage</h1>
          </div>
          <div className={styles.rangeWrap}>
            <button
              type="button"
              className={styles.rangeButton}
              aria-expanded={rangeOpen}
              onClick={() => setRangeOpen((open) => !open)}
            >
              <CalendarDays size={16} />
              Last {days} days
              <ChevronDown size={16} className={styles.rangeChevron} />
            </button>
            {rangeOpen ? (
              <div className={styles.rangeMenu}>
                {RANGE_OPTIONS.map((option) => (
                  <button
                    type="button"
                    key={option}
                    onClick={() => {
                      setDays(option);
                      setRangeOpen(false);
                    }}
                  >
                    Last {option} days
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <h2 className={styles.sectionTitle}>Last {days} days</h2>
        <div className={styles.metrics}>
          <MetricCard
            icon={Package}
            label="Model requests"
            value={total.requests.toLocaleString('en-US')}
            trend={percentageChange(total.requests, previousData?.total.requests ?? 0)}
          />
          <MetricCard
            icon={FileText}
            label="Input tokens"
            value={compactNumber(total.input_tokens)}
            trend={percentageChange(total.input_tokens, previousData?.total.input_tokens ?? 0)}
            muted
          />
          <MetricCard
            icon={Zap}
            label="Output tokens"
            value={compactNumber(total.output_tokens)}
            trend={percentageChange(total.output_tokens, previousData?.total.output_tokens ?? 0)}
            muted
          />
        </div>

        {error ? (
          <div className={styles.errorState} role="alert">
            <span>{error}</span>
            <button type="button" onClick={retry}>
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        ) : null}

        <UsageChart rows={rows} days={days} loading={loading} />
        <UsageTable rows={models} requestTotal={total.requests} loading={loading} />
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  trend,
  muted = false,
}: {
  icon: typeof Package;
  label: string;
  value: string;
  trend: number;
  muted?: boolean;
}) {
  return (
    <article className={styles.metricCard}>
      <div className={muted ? styles.metricIconMuted : styles.metricIcon}>
        <Icon size={20} />
      </div>
      <div>
        <p>{label}</p>
        <div className={styles.metricValue}>
          <strong>{value}</strong>
          <span
            className={
              trend === 0 ? styles.trendFlat : trend > 0 ? styles.trendUp : styles.trendDown
            }
          >
            {trend === 0 ? (
              <Minus size={14} />
            ) : trend > 0 ? (
              <ArrowUp size={14} />
            ) : (
              <ArrowDown size={14} />
            )}
            {Math.abs(trend)}%
          </span>
        </div>
      </div>
    </article>
  );
}

function UsageChart({
  rows,
  days,
  loading,
}: {
  rows: UsageSummaryRow[];
  days: number;
  loading: boolean;
}) {
  const rawMaxRequests = Math.max(1, ...rows.map((row) => row.requests));
  const roughStep = rawMaxRequests / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalizedStep = roughStep / magnitude;
  const stepFactor = [1, 2, 2.5, 3, 5, 10].find((factor) => factor >= normalizedStep) ?? 10;
  const chartStep = stepFactor * magnitude;
  const maxRequests = Math.ceil(rawMaxRequests / chartStep) * chartStep;
  const maxTokens = Math.max(1, ...rows.map((row) => row.input_tokens + row.output_tokens));
  const points = rows.map((row, index) => {
    const x = rows.length === 1 ? 0 : (index / (rows.length - 1)) * 1000;
    const y = 196 - (row.requests / maxRequests) * 186;
    return `${x},${y}`;
  });
  const tickIndexes = [0, 0.2, 0.4, 0.6, 0.8, 1].map((ratio) =>
    Math.min(rows.length - 1, Math.round((rows.length - 1) * ratio))
  );

  return (
    <section className={styles.chartCard} aria-busy={loading}>
      <header className={styles.chartHeader}>
        <h2>Daily usage (last {days} days)</h2>
        <div className={styles.legend}>
          <span>
            <i className={styles.dotRequests} />
            Model requests
          </span>
          <span>
            <i className={styles.dotInput} />
            Input tokens
          </span>
          <span>
            <i className={styles.dotOutput} />
            Output tokens
          </span>
        </div>
      </header>
      <div className={styles.chart}>
        <div className={styles.yAxis}>
          {[1, 0.75, 0.5, 0.25, 0].map((ratio) => (
            <span key={ratio}>{compactNumber(Math.round(maxRequests * ratio))}</span>
          ))}
        </div>
        <div className={styles.plot}>
          <div className={styles.gridLines}>
            {[0, 1, 2, 3, 4].map((line) => (
              <i key={line} />
            ))}
          </div>
          <div className={styles.bars}>
            {rows.map((row) => {
              const totalTokens = row.input_tokens + row.output_tokens;
              const height = Math.max(totalTokens > 0 ? 2 : 0, (totalTokens / maxTokens) * 95);
              const inputShare = totalTokens ? (row.input_tokens / totalTokens) * 100 : 0;
              return (
                <span className={styles.bar} style={{ height: `${height}%` }} key={row.period}>
                  <i className={styles.inputBar} style={{ height: `${inputShare}%` }} />
                  <i className={styles.outputBar} style={{ height: `${100 - inputShare}%` }} />
                </span>
              );
            })}
          </div>
          <svg
            className={styles.line}
            viewBox="0 0 1000 200"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline
              points={points.join(' ')}
              fill="none"
              stroke="var(--color-brand)"
              strokeWidth="2.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {rows.map((row, index) => {
              const [cx, cy] = points[index]?.split(',').map(Number) ?? [0, 196];
              return (
                <circle
                  key={row.period}
                  cx={cx}
                  cy={cy}
                  r="3.5"
                  fill="var(--color-brand)"
                  stroke="var(--on-accent)"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>
          <div className={styles.xAxis}>
            {tickIndexes.map((index) => (
              <span key={rows[index]?.period}>
                {shortDate(new Date(rows[index]?.period ?? Date.now()))}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function UsageTable({
  rows,
  requestTotal,
  loading,
}: {
  rows: UsageModelRow[];
  requestTotal: number;
  loading: boolean;
}) {
  return (
    <section className={styles.tableCard} aria-busy={loading}>
      <header>
        <h2>Usage by model</h2>
      </header>
      <div className={styles.tableScroll}>
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>
                <span>
                  Requests <ArrowDown size={12} />
                </span>
              </th>
              <th>Input tokens</th>
              <th>Output tokens</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const share = requestTotal ? Math.round((row.requests / requestTotal) * 100) : 0;
              return (
                <tr key={row.model}>
                  <td>
                    <div className={styles.modelCell}>
                      <ModelMark model={row.model} />
                      <div>
                        <strong>{modelDisplayName(row.model)}</strong>
                        <span>{modelProvider(row.model)}</span>
                      </div>
                    </div>
                  </td>
                  <td>{row.requests.toLocaleString('en-US')}</td>
                  <td>{compactNumber(row.input_tokens)}</td>
                  <td>{compactNumber(row.output_tokens)}</td>
                  <td>
                    <div className={styles.share}>
                      <span>{share}%</span>
                      <i>
                        <b style={{ width: `${share}%` }} />
                      </i>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 ? (
              <tr>
                <td className={styles.emptyRow} colSpan={5}>
                  No model usage in this period
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ModelMark({ model }: { model: string }) {
  const provider = modelProvider(model);
  if (provider === 'Anthropic') {
    return (
      <svg className={styles.modelMark} viewBox="0 0 40 40" aria-hidden="true">
        <path
          d="M20 2C20 11.94 28.06 20 38 20C28.06 20 20 28.06 20 38C20 28.06 11.94 20 2 20C11.94 20 20 11.94 20 2Z"
          fill="var(--status-warning)"
        />
        <path
          d="M11 11C11 15.97 15.03 20 20 20C15.03 20 11 24.03 11 29C11 24.03 6.97 20 2 20C6.97 20 11 15.97 11 11Z"
          fill="var(--status-warning)"
        />
        <path
          d="M29 11C29 15.97 33.03 20 38 20C33.03 20 29 24.03 29 29C29 24.03 24.97 20 20 20C24.97 20 29 15.97 29 11Z"
          fill="var(--status-warning)"
        />
      </svg>
    );
  }
  if (provider === 'OpenAI') return <span className={styles.openAiMark}>◎</span>;
  return (
    <span className={styles.genericMark}>
      <Package size={19} />
    </span>
  );
}
