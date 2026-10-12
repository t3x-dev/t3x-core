'use client';

import { GitBranch, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useBranchRules } from '@/hooks/projects/useBranchRules';
import { SettingsField, SettingsSection } from './SettingsSection';

const DEFAULT_BRANCH = 'main';

const RULE_OPTIONS = [
  { value: 'direct', label: 'Allow direct commits' },
  { value: 'review', label: 'Require another reviewer' },
] as const;

const SELECT_CLASS =
  'h-9 w-full rounded-[var(--radius-control)] border border-[var(--stroke-default)] bg-[var(--surface-card)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--stroke-strong)] focus:ring-2 focus:ring-[var(--ring)]/30 disabled:opacity-60';

export function ProjectBranchRulesSettings({ projectId }: { projectId: string }) {
  const { error, loading, rules, save, savingRef } = useBranchRules(projectId);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);

  const fallbackRef =
    rules.find((rule) => rule.ref_name === DEFAULT_BRANCH)?.ref_name ?? rules[0]?.ref_name ?? null;
  const activeRef = rules.some((rule) => rule.ref_name === selectedRef) ? selectedRef : fallbackRef;
  const rule = rules.find((candidate) => candidate.ref_name === activeRef) ?? null;

  return (
    <SettingsSection
      description="Choose whether the proposer can approve and commit their own changes, or someone else must approve them first."
      icon={GitBranch}
      id="branch-rules"
      title="Branch rules"
    >
      <div className="grid gap-4">
        {error ? (
          <p
            className="rounded-[var(--radius-control)] bg-[var(--status-danger)]/10 px-3 py-2 text-xs leading-5 text-[var(--status-danger)]"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Loading branch rules…
          </div>
        ) : rule === null ? (
          error ? null : (
            <p className="text-sm text-[var(--text-secondary)]">
              This repository has no branches yet.
            </p>
          )
        ) : (
          <>
            <SettingsField htmlFor="branch-rule-branch" label="Branch">
              <select
                className={`${SELECT_CLASS} font-mono`}
                disabled={savingRef !== null}
                id="branch-rule-branch"
                onChange={(event) => setSelectedRef(event.target.value)}
                value={rule.ref_name}
              >
                {rules.map((candidate) => (
                  <option key={candidate.ref_name} value={candidate.ref_name}>
                    {candidate.ref_name}
                  </option>
                ))}
              </select>
            </SettingsField>
            <SettingsField
              hint={
                rule.source === 'custom'
                  ? 'Custom policy. Only the reviewer requirement changes here.'
                  : undefined
              }
              htmlFor="branch-rule-mode"
              label="Commit rule"
            >
              <div className="flex items-center gap-2">
                <select
                  className={SELECT_CLASS}
                  disabled={savingRef !== null}
                  id="branch-rule-mode"
                  onChange={(event) => void save(rule.ref_name, event.target.value === 'review')}
                  value={rule.require_independent_review ? 'review' : 'direct'}
                >
                  {RULE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {savingRef === rule.ref_name ? (
                  <Loader2
                    aria-hidden="true"
                    className="size-3.5 shrink-0 animate-spin text-[var(--text-tertiary)]"
                  />
                ) : null}
              </div>
            </SettingsField>
          </>
        )}
      </div>
    </SettingsSection>
  );
}
