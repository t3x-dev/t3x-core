import { Button } from '@/components/ui/button';

export function BranchLoadError({
  error,
  loading,
  onRetry,
}: {
  error: string | null;
  loading: boolean;
  onRetry: () => Promise<boolean>;
}) {
  if (!error) return null;
  return (
    <div role="alert" className="shrink-0 px-4 py-2 text-sm text-[var(--status-error)]">
      Branch list unavailable. Previously loaded branches may be out of date. {error}{' '}
      <Button size="sm" variant="ghost" disabled={loading} onClick={() => void onRetry()}>
        {loading ? 'Retrying branches…' : 'Retry branches'}
      </Button>
    </div>
  );
}
