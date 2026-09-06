'use client';

/** A deterministic reading layout for JSON values; never infers a domain or executes content. */
export function StateValueReader({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || typeof value !== 'object') {
    return (
      <span className="whitespace-pre-wrap break-words text-sm leading-6 text-[var(--text-primary)]">
        {value === null
          ? 'null'
          : typeof value === 'boolean'
            ? value
              ? 'true'
              : 'false'
            : String(value)}
      </span>
    );
  }
  const entries = Object.entries(value);
  if (!entries.length)
    return (
      <span className="text-xs text-[var(--text-tertiary)]">
        {Array.isArray(value) ? 'Empty list' : 'Empty object'}
      </span>
    );
  if (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        Object.values(item).every((cell) => cell === null || typeof cell !== 'object')
    )
  ) {
    const columns = [...new Set(value.flatMap((item) => Object.keys(item)))];
    if (columns.length > 0 && columns.length <= 8)
      return (
        <div className="overflow-x-auto rounded-md border border-[var(--stroke-divider)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--surface-panel)]">
              <tr>
                {columns.map((key) => (
                  <th className="px-3 py-2 font-medium" key={key}>
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {value.map((row, index) => (
                <tr key={String(index)} className="border-t border-[var(--stroke-divider)]">
                  {columns.map((key) => (
                    <td className="min-w-24 px-3 py-2 align-top" key={key}>
                      {Object.hasOwn(row, key) ? (
                        <StateValueReader value={row[key]} depth={depth + 1} />
                      ) : (
                        <span title="Absent">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
  return (
    <div className="divide-y divide-[var(--stroke-divider)]">
      {entries.map(([key, child]) => {
        const composite = child !== null && typeof child === 'object';
        return composite ? (
          <details key={key} open={depth < 2} className="py-2.5">
            <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)]">
              {Array.isArray(value) ? `Item ${Number(key) + 1}` : key}
              <span className="ml-2 font-mono text-[10px] font-normal text-[var(--text-tertiary)]">
                {Array.isArray(child) ? 'list' : 'object'} · {Object.keys(child).length}
              </span>
            </summary>
            <div className="mt-2 border-l border-[var(--stroke-divider)] pl-3">
              <StateValueReader value={child} depth={depth + 1} />
            </div>
          </details>
        ) : (
          <div
            key={key}
            className="grid grid-cols-[minmax(80px,0.7fr)_minmax(0,1.3fr)] gap-3 py-2.5"
          >
            <span className="break-words text-xs text-[var(--text-secondary)]">
              {Array.isArray(value) ? Number(key) + 1 : key}
            </span>
            <StateValueReader value={child} depth={depth + 1} />
          </div>
        );
      })}
    </div>
  );
}

export function StateSemanticReader({
  trees,
}: {
  trees: Array<{ key: string; slots: Record<string, unknown>; children: unknown[] }>;
}) {
  return (
    <div className="space-y-4">
      {trees.map((tree, index) => (
        <article
          key={`${index}:${tree.key}`}
          className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4"
        >
          <h4 className="mb-2 text-base font-semibold">{tree.key}</h4>
          <StateValueReader value={tree.slots} />
          {tree.children.length > 0 ? (
            <div className="mt-3 border-t border-[var(--stroke-divider)] pt-3">
              <StateSemanticReader trees={tree.children as typeof trees} />
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
