import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getPrimarySchemaBinding } from '@/domain/workspaces/selectors';
import type {
  WorkspaceCandidate,
  WorkspaceSchemaCandidateField,
  WorkspaceSchemaFieldStatus,
} from '@/types/workspaces';

export function SchemaReviewTab({ candidate }: { candidate: WorkspaceCandidate }) {
  const schemaBinding = getPrimarySchemaBinding(candidate.schemaBindings);
  const fields = flattenFields(candidate.schemaCandidate.fields);
  const reviewFields = fields.filter((field) => field.status !== 'covered');
  const schemaErrorFields = fields.filter((field) => field.status === 'type_mismatch');
  const yopsOperations = candidate.yopsDraft.operations;
  const schemaReviewName = schemaBinding
    ? schemaBinding.schemaName.replace(/\s+Schema$/i, '')
    : 'Candidate';
  const yamlLines = buildCandidateYamlLines(candidate, schemaReviewName);
  const blockingFields = reviewFields.filter((field) =>
    ['missing', 'needs_confirmation', 'type_mismatch'].includes(field.status)
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 border-b border-[var(--stroke-divider)] pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">
            YSchema {schemaReviewName} Review
          </h3>
          <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">
            Validate candidate structure before YOps extraction.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" type="button" variant="canvas-outline">
            Diff
          </Button>
          <Button
            className="bg-[var(--accent-extract)] text-[var(--on-accent)] hover:bg-[var(--accent-extract)]/90"
            size="sm"
            type="button"
          >
            Send to YOps
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_296px]">
        <section
          aria-label="Candidate tree"
          className="min-w-0 overflow-hidden rounded-md border border-[var(--stroke-divider)] bg-[var(--editor-bg)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--stroke-divider)] bg-[var(--editor-gutter)] px-3 py-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Candidate tree
              </p>
              <h4 className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
                Candidate {schemaReviewName}
              </h4>
            </div>
            <Badge variant="secondary">YAML</Badge>
          </div>
          <div className="overflow-x-auto py-3">
            <div className="min-w-[560px] font-mono text-[13px] leading-6">
              {yamlLines.map((line) => (
                <CandidateYamlLine key={line.id} line={line} />
              ))}
            </div>
          </div>
        </section>

        <aside aria-label="YSchema review summary" className="flex flex-col gap-3">
          <ReviewCard
            status={blockingFields.length > 0 ? 'warning' : 'success'}
            title={
              blockingFields.length > 0
                ? blockingFields.map((field) => field.path).join(', ')
                : 'Candidate coverage ready'
            }
          >
            {blockingFields.length > 0
              ? 'Fill or confirm before YOps handoff.'
              : candidate.schemaCandidate.summary}
          </ReviewCard>

          <ReviewCard
            status={schemaErrorFields.length > 0 ? 'warning' : 'success'}
            title={`${schemaErrorFields.length} schema ${
              schemaErrorFields.length === 1 ? 'error' : 'errors'
            }`}
          >
            {schemaErrorFields.length > 0
              ? 'Fix typed fields before creating the YOps draft.'
              : `Candidate shape matches ${schemaReviewName} schema.`}
          </ReviewCard>

          <ReviewCard status="extract" title="YOps suggestions">
            {yopsOperations.length > 0
              ? `${yopsOperations.length} suggested ${
                  yopsOperations.length === 1 ? 'operation' : 'operations'
                } from this candidate.`
              : 'No YOps suggestions yet.'}
          </ReviewCard>

          {yopsOperations.length > 0 ? (
            <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Proposed YOps
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {yopsOperations.map((operation) => (
                  <li
                    className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-canvas)] px-3 py-2"
                    key={operation.id}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="pending">{operation.op}</Badge>
                      <span className="font-mono text-xs text-[var(--text-secondary)]">
                        {operation.path}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">
                      {operation.summary}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Button
            className="w-full bg-[var(--accent-extract)] text-[var(--on-accent)] hover:bg-[var(--accent-extract)]/90"
            type="button"
          >
            Send to YOps
          </Button>

          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
            <Badge variant={candidate.schemaReview.verdict === 'ready' ? 'success' : 'warning'}>
              {candidate.schemaReview.verdict === 'ready' ? 'Ready' : 'Needs review'}
            </Badge>
            <span>
              {schemaBinding ? `${schemaBinding.schemaName} ${schemaBinding.version}` : 'No schema'}
            </span>
            {schemaBinding ? <span>{formatBindingMode(schemaBinding.mode)}</span> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

interface CandidateYamlLineData {
  id: string;
  indent: number;
  text: string;
  status?: WorkspaceSchemaFieldStatus;
}

function CandidateYamlLine({ line }: { line: CandidateYamlLineData }) {
  return (
    <div className={yamlLineClassName(line.status)}>
      <span
        aria-hidden="true"
        className="inline-block select-none text-[var(--text-quaternary)]"
        style={{ width: `${line.indent * 1.5}rem` }}
      />
      <span>{line.text}</span>
    </div>
  );
}

function ReviewCard({
  children,
  status,
  title,
}: {
  children: string;
  status: 'extract' | 'success' | 'warning';
  title: string;
}) {
  return (
    <div
      className={`rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 py-3 ${reviewCardAccentClassName(
        status
      )}`}
    >
      <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      <p className="mt-2 text-sm font-medium leading-5 text-[var(--text-secondary)]">{children}</p>
    </div>
  );
}

function buildCandidateYamlLines(
  candidate: WorkspaceCandidate,
  schemaReviewName: string
): CandidateYamlLineData[] {
  const rootKey = schemaReviewName.toLowerCase().replaceAll(/\s+/g, '_');
  const lines: CandidateYamlLineData[] = [
    { id: 'root', indent: 0, text: `${rootKey}:` },
    { id: 'title', indent: 1, text: `title: ${candidate.title}` },
  ];

  for (const field of candidate.schemaCandidate.fields) {
    lines.push(...fieldToYamlLines(field, 1));
  }

  return lines;
}

function fieldToYamlLines(
  field: WorkspaceSchemaCandidateField,
  indent: number
): CandidateYamlLineData[] {
  const key = field.path.split('.').at(-1) ?? field.path;

  if (field.children?.length) {
    return [
      { id: field.id, indent, text: `${key}:` },
      ...field.children.flatMap((child) => fieldToYamlLines(child, indent + 1)),
    ];
  }

  return [
    {
      id: field.id,
      indent,
      status: field.status,
      text: field.value ? `${key}: ${field.value}` : `${key}:`,
    },
  ];
}

function yamlLineClassName(status?: WorkspaceSchemaFieldStatus): string {
  const base = 'min-h-6 whitespace-pre px-4 text-[var(--text-primary)]';

  if (status === 'covered') {
    return `${base} bg-[var(--diff-added-bg)] text-[var(--diff-added-text)]`;
  }

  if (status === 'missing' || status === 'needs_confirmation' || status === 'type_mismatch') {
    return `${base} bg-[var(--diff-modified-bg)] text-[var(--diff-modified-text)]`;
  }

  if (status === 'extra') {
    return `${base} bg-[var(--surface-elevated)] text-[var(--text-secondary)]`;
  }

  return base;
}

function reviewCardAccentClassName(status: 'extract' | 'success' | 'warning'): string {
  const classes = {
    extract: 'border-l-4 border-l-[var(--accent-extract)]',
    success: 'border-l-4 border-l-[var(--status-success)]',
    warning: 'border-l-4 border-l-[var(--status-warning)]',
  };

  return classes[status];
}

function flattenFields(fields: WorkspaceSchemaCandidateField[]): WorkspaceSchemaCandidateField[] {
  return fields.flatMap((field) => [field, ...flattenFields(field.children ?? [])]);
}

function formatBindingMode(mode: string): string {
  return mode.replaceAll('_', ' ');
}
