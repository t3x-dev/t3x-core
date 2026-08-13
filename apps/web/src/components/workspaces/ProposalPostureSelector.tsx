import type { WorkspaceProposalPosture } from '@/types/workspaces';
import { cn } from '@/utils/cn';

export const PROPOSAL_POSTURE_OPTIONS: Array<{
  value: WorkspaceProposalPosture;
  label: string;
  shortLabel: string;
  policy: string;
  title: string;
  description: string;
}> = [
  {
    value: 'source_only',
    label: 'Source only — use directly supported content',
    shortLabel: 'Source only',
    policy: 'strict grounding',
    title: 'Only generate changes directly supported by sources',
    description: 'Missing evidence remains visible and is never silently completed.',
  },
  {
    value: 'guided',
    label: 'Guided — allow explicit, basis-backed inference',
    shortLabel: 'Guided',
    policy: 'guided inference',
    title: 'Allow supported inference and expose the reasoning chain',
    description: 'Every inference keeps its basis, assumptions, and review boundary visible.',
  },
  {
    value: 'recommend',
    label: 'Recommend — propose improvements for human review',
    shortLabel: 'Recommend',
    policy: 'recommend + challenge',
    title: 'Propose improvements while preserving a way to challenge them',
    description:
      'Recommendations stay separate from source facts and always require a human decision.',
  },
];

export function proposalPostureOption(posture: WorkspaceProposalPosture) {
  return PROPOSAL_POSTURE_OPTIONS.find((option) => option.value === posture)!;
}

export function ProposalPostureSelector({
  disabled,
  id = 'proposal-posture',
  onChange,
  value,
  className,
}: {
  disabled?: boolean;
  id?: string;
  onChange: (posture: WorkspaceProposalPosture) => void;
  value: WorkspaceProposalPosture;
  className?: string;
}) {
  return (
    <select
      aria-label="Proposal mode"
      className={cn(
        'h-9 min-w-[290px] rounded-md border border-[var(--stroke-strong)] bg-[var(--surface-card)] px-3 text-xs font-semibold text-[var(--text-primary)] outline-none transition focus:border-[var(--source)] focus:ring-2 focus:ring-[var(--source)]/20 disabled:cursor-not-allowed disabled:opacity-60',
        className
      )}
      disabled={disabled}
      id={id}
      onChange={(event) => onChange(event.currentTarget.value as WorkspaceProposalPosture)}
      value={value}
    >
      {PROPOSAL_POSTURE_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
