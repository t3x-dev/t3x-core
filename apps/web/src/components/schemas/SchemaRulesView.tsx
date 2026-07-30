import { Badge } from '@/components/ui/badge';
import type { SchemaReleasePreview } from '@/types/schemas';

interface SchemaRulesViewProps {
  release: SchemaReleasePreview;
}

export function SchemaRulesView({ release }: SchemaRulesViewProps) {
  const executableCount = release.rules.filter((rule) => rule.kind === 'executable').length;

  return (
    <section
      aria-labelledby="schema-rules-title"
      className="min-w-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-panel)]"
    >
      <header className="flex min-h-[46px] flex-wrap items-center justify-between gap-3 border-b border-[var(--stroke-divider)] px-3 py-2.5">
        <div>
          <h4
            className="text-[13px] font-semibold text-[var(--text-primary)]"
            id="schema-rules-title"
          >
            Schema rules
          </h4>
          <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">
            Executable rules run deterministically; descriptive rules guide authors and reviewers.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5 text-xs text-[var(--text-secondary)]">
          <span>
            {release.rules.length} {release.rules.length === 1 ? 'rule' : 'rules'}
          </span>
          <Badge className="text-[10px]" variant="success">
            {executableCount} executable
          </Badge>
        </div>
      </header>

      {release.rules.length === 0 ? (
        <div className="grid min-h-56 place-items-center p-6 text-center">
          <div className="max-w-sm">
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">
              No rules declared
            </p>
            <p className="mt-1 text-xs leading-[1.55] text-[var(--text-secondary)]">
              This release relies on its structural contract and typed relations only.
            </p>
          </div>
        </div>
      ) : (
        <ul className="grid list-none gap-px bg-[var(--stroke-divider)] p-0 min-[1181px]:grid-cols-2">
          {release.rules.map((rule) => (
            <li className="min-w-0 bg-[var(--surface-panel)] p-3.5" key={rule.id}>
              <article aria-labelledby={`schema-rule-${rule.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h5
                    className="min-w-0 break-words font-mono text-xs font-bold text-[var(--text-primary)]"
                    id={`schema-rule-${rule.id}`}
                  >
                    {rule.id}
                  </h5>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge
                      className="text-[10px]"
                      variant={rule.kind === 'executable' ? 'success' : 'outline'}
                    >
                      {rule.kind}
                    </Badge>
                    {rule.blocking ? (
                      <Badge className="text-[10px]" variant="warning">
                        blocking
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <p className="mt-2.5 text-xs leading-[1.55] text-[var(--text-secondary)]">
                  {rule.description}
                </p>
                <dl className="mt-3 grid gap-2">
                  <div className="grid grid-cols-[58px_minmax(0,1fr)] items-start gap-2">
                    <dt className="text-[10px] font-bold uppercase tracking-[0.05em] text-[var(--text-tertiary)]">
                      Scope
                    </dt>
                    <dd className="m-0 min-w-0 break-all font-mono text-[11px] text-[var(--text-primary)]">
                      {rule.scope}
                    </dd>
                  </div>
                  <div className="grid grid-cols-[58px_minmax(0,1fr)] items-start gap-2">
                    <dt className="pt-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-[var(--text-tertiary)]">
                      Signals
                    </dt>
                    <dd className="m-0 flex min-w-0 flex-wrap gap-1.5">
                      {rule.signals.map((signal) => (
                        <Badge className="font-mono text-[10px]" key={signal} variant="outline">
                          {signal}
                        </Badge>
                      ))}
                    </dd>
                  </div>
                </dl>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
