'use client';

interface TypeStats {
  total: number;
  accepted: number;
  edited: number;
  rejected: number;
}

interface FeedbackByTypeTableProps {
  byType: Record<string, TypeStats>;
}

export function FeedbackByTypeTable({ byType }: FeedbackByTypeTableProps) {
  const rows = Object.entries(byType)
    .map(([type, s]) => ({ type, ...s }))
    .sort((a, b) => b.total - a.total);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--text-tertiary)]">No feedback data by type available.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--stroke-divider)] text-left text-[var(--text-tertiary)]">
            <th className="pb-2 pr-4 font-medium">Type</th>
            <th className="pb-2 pr-4 font-medium">Total</th>
            <th className="pb-2 pr-4 font-medium">Accepted</th>
            <th className="pb-2 pr-4 font-medium">Edited</th>
            <th className="pb-2 pr-4 font-medium">Rejected</th>
            <th className="pb-2 font-medium">Accept Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const acceptRate = row.total > 0 ? row.accepted / row.total : 0;
            return (
              <tr
                key={row.type}
                className="border-b border-[var(--stroke-divider)] last:border-b-0"
              >
                <td className="py-2 pr-4 font-medium text-[var(--text-primary)]">{row.type}</td>
                <td className="py-2 pr-4 text-[var(--text-secondary)]">{row.total}</td>
                <td className="py-2 pr-4 text-emerald-600">{row.accepted}</td>
                <td className="py-2 pr-4 text-blue-600">{row.edited}</td>
                <td className="py-2 pr-4 text-red-600">{row.rejected}</td>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-[var(--surface-app)]">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${acceptRate * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-[var(--text-tertiary)]">
                      {(acceptRate * 100).toFixed(0)}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
