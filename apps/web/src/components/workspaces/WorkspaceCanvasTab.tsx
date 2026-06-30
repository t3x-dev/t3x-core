import type { WorkspaceCandidate } from '@/types/workspaces';

const CANVAS_STEPS = ['Source bundle', 'Candidate', 'YOps draft', 'Commit target'] as const;

export function WorkspaceCanvasTab({ candidate }: { candidate: WorkspaceCandidate }) {
  return (
    <div className="grid gap-2">
      {CANVAS_STEPS.map((step, index) => (
        <div
          className="flex items-center gap-3 rounded-md border border-[var(--stroke-divider)] px-3 py-2"
          key={step}
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--accent-branch)] text-xs text-[var(--accent-branch)]">
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)]">{step}</p>
            <p className="truncate text-xs text-[var(--text-secondary)]">
              {getStepDescription(step, candidate)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function getStepDescription(
  step: (typeof CANVAS_STEPS)[number],
  candidate: WorkspaceCandidate
): string {
  if (step === 'Source bundle') return `${candidate.sourceBundle.length} source items`;
  if (step === 'Candidate') return candidate.title;
  if (step === 'YOps draft') return `${candidate.yopsDraft.operations.length} operations`;
  return candidate.targetBranch;
}
