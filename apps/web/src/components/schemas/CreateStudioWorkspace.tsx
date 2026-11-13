import { useState } from 'react';
import { BranchLoadError } from '@/components/project/BranchLoadError';
import { Button } from '@/components/ui/button';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';
import { useBranches } from '@/hooks/shared/useBranches';
import { useWorkspaceFlow } from '@/hooks/workspaces/useWorkspaceFlow';

export function CreateStudioWorkspace({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: (id: string) => Promise<void>;
}) {
  const { saveDraft } = useWorkspaceFlow();
  const {
    branches,
    branchHeads,
    loading,
    error: branchesError,
    refresh,
  } = useBranches(projectId, true);
  const [branch, setBranch] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const targetBranch = branches.includes(branch) ? branch : (branches[0] ?? '');
  async function create() {
    if (!targetBranch || pending || loading || branchesError) return;
    setPending(true);
    setError(undefined);
    try {
      const candidate = getProjectWorkspaceStarterCandidate(
        projectId,
        [],
        targetBranch,
        branchHeads[targetBranch] ?? null
      );
      // A fresh ID cannot overwrite an existing draft or a committed workspace.
      candidate.id = `workspace_${crypto.randomUUID()}`;
      candidate.yopsDraft.id = `draft:${candidate.id}`;
      candidate.schemaBindings = [];
      candidate.schemaReview = {
        verdict: 'needs_review',
        summary: 'Choose and review a definition.',
        gaps: [],
      };
      const saved = await saveDraft(candidate);
      await onCreated(saved.workspace.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create Workspace.');
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="mt-3 space-y-3 border-t border-[var(--stroke-divider)] pt-3">
      <p className="text-xs text-[var(--text-secondary)]">
        Create a Workspace to review and apply this definition.
      </p>
      <label className="block text-xs">
        Branch
        <select
          aria-label="New Workspace branch"
          className="mt-2 w-full rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-2 text-sm"
          value={targetBranch}
          onChange={(event) => setBranch(event.target.value)}
          disabled={pending || loading || Boolean(branchesError)}
        >
          {!branches.length ? (
            <option value="">
              {loading
                ? 'Loading branches…'
                : branchesError
                  ? 'Branches unavailable'
                  : 'No branches available'}
            </option>
          ) : null}
          {branches.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <BranchLoadError error={branchesError} loading={loading} onRetry={refresh} />
      {error ? (
        <p role="alert" className="text-xs text-[var(--status-error)]">
          {error}
        </p>
      ) : null}
      <Button
        size="sm"
        disabled={pending || loading || Boolean(branchesError) || !targetBranch}
        onClick={() => void create()}
      >
        {pending ? 'Creating…' : 'Create Workspace'}
      </Button>
      {!loading && !branchesError && !branches.length ? (
        <Button size="sm" variant="ghost" onClick={() => void refresh()}>
          Retry branches
        </Button>
      ) : null}
    </div>
  );
}
