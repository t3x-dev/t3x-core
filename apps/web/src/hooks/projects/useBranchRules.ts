import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { formatUserFacingError } from '@/domain/format/errors';
import { listBranches, updateBranchRules } from '@/infrastructure/branches';
import type { Branch, BranchRules, BranchRulesUpdate } from '@/infrastructure/types';

export const DEFAULT_BRANCH_RULES: BranchRules = {
  commit: { require_independent_review: false, source: 'default' },
};

export function branchRules(branch: Branch): BranchRules {
  return branch.rules ?? DEFAULT_BRANCH_RULES;
}

export function useBranchRules(projectId: string) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingBranch, setSavingBranch] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { branches: listed } = await listBranches(projectId);
      const seen = new Set<string>();
      setBranches(listed.filter((branch) => !seen.has(branch.name) && seen.add(branch.name)));
      setError(null);
    } catch (loadError) {
      setError(formatUserFacingError(loadError, 'Failed to load branch rules.'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (branchName: string, rules: BranchRulesUpdate) => {
      setSavingBranch(branchName);
      setError(null);
      try {
        const saved = await updateBranchRules(projectId, branchName, rules);
        setBranches((current) =>
          current.map((branch) => (branch.name === saved.name ? saved : branch))
        );
        toast.success(`Branch rules for ${branchName} updated`);
      } catch (saveError) {
        setError(formatUserFacingError(saveError, 'Failed to update the branch rules.'));
      } finally {
        setSavingBranch(null);
      }
    },
    [projectId]
  );

  return { branches, error, loading, save, savingBranch };
}
