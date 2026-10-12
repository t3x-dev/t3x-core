'use client';

import { GitBranch, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { branchRules, useBranchRules } from '@/hooks/projects/useBranchRules';
import { SettingsField, SettingsSection } from './SettingsSection';

const DEFAULT_BRANCH = 'main';

const RULE_OPTIONS = [
  { value: 'direct', label: 'Allow direct commits' },
  { value: 'review', label: 'Require another reviewer' },
] as const;

const SELECT_CLASS =
  'h-9 w-full rounded-[var(--radius-control)] border border-[var(--stroke-default)] bg-[var(--surface-card)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--stroke-strong)] focus:ring-2 focus:ring-[var(--ring)]/30 disabled:opacity-60';

export function ProjectBranchRulesSettings({ projectId }: { projectId: string }) {
  const { branches, error, loading, save, savingBranch } = useBranchRules(projectId);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const branch =
    branches.find((candidate) => candidate.name === selectedName) ??
    branches.find((candidate) => candidate.name === DEFAULT_BRANCH) ??
    branches[0] ??
    null;
  const commitRule = branch ? branchRules(branch).commit : null;

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
        ) : branch === null || commitRule === null ? (
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
                disabled={savingBranch !== null}
                id="branch-rule-branch"
                onChange={(event) => setSelectedName(event.target.value)}
                value={branch.name}
              >
                {branches.map((candidate) => (
                  <option key={candidate.name} value={candidate.name}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </SettingsField>
            <SettingsField
              hint={
                commitRule.source === 'custom'
                  ? 'Custom policy. Only the reviewer requirement changes here.'
                  : undefined
              }
              htmlFor="branch-rule-mode"
              label="Commit rule"
            >
              <div className="flex items-center gap-2">
                <select
                  className={SELECT_CLASS}
                  disabled={savingBranch !== null}
                  id="branch-rule-mode"
                  onChange={(event) =>
                    void save(branch.name, {
                      commit: { require_independent_review: event.target.value === 'review' },
                    })
                  }
                  value={commitRule.require_independent_review ? 'review' : 'direct'}
                >
                  {RULE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {savingBranch === branch.name ? (
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
