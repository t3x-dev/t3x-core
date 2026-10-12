import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { formatUserFacingError } from '@/domain/format/errors';
import { listBranches } from '@/infrastructure/branches';
import { type BranchRule, getBranchRule, setBranchRule } from '@/infrastructure/branchRules';

export function useBranchRules(projectId: string) {
  const [rules, setRules] = useState<BranchRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRef, setSavingRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { branches } = await listBranches(projectId);
      const names = [...new Set(branches.map((branch) => branch.name))];
      setRules(await Promise.all(names.map((name) => getBranchRule(projectId, name))));
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
    async (refName: string, requireIndependentReview: boolean) => {
      setSavingRef(refName);
      setError(null);
      try {
        const saved = await setBranchRule(projectId, refName, requireIndependentReview);
        setRules((current) =>
          current.map((rule) => (rule.ref_name === saved.ref_name ? saved : rule))
        );
        toast.success(`Branch rule for ${refName} updated`);
      } catch (saveError) {
        setError(formatUserFacingError(saveError, 'Failed to update the branch rule.'));
      } finally {
        setSavingRef(null);
      }
    },
    [projectId]
  );

  return { error, loading, rules, save, savingRef };
}
