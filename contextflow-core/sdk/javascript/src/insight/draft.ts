/**
 * Draft summary bullet generator.
 */

export interface AspectSummary {
  aspectId: string;
  title: string;
  findings: string[];
  confidence: number;
}

const MAX_FINDINGS_PER_ASPECT = 2;
const MAX_FINDING_LENGTH = 80;

export function renderBullets(aspects: AspectSummary[]): string[] {
  return aspects.map(aspect => formatAspect(aspect));
}

function formatAspect(aspect: AspectSummary): string {
  const title = aspect.title?.trim() || "Unnamed aspect";
  const confidenceLabel = formatConfidence(aspect.confidence);
  const prefix = `- ${title}${confidenceLabel ? ` ${confidenceLabel}` : ""}`;

  if (!aspect.findings || aspect.findings.length === 0) {
    return `${prefix}: Missing evidence`;
  }

  const snippets = aspect.findings.slice(0, MAX_FINDINGS_PER_ASPECT).map(snippet => summarize(snippet));
  const remaining = aspect.findings.length - snippets.length;
  if (remaining > 0) {
    snippets.push(`plus ${remaining} more`);
  }

  let body = snippets.join(";");
  if (aspect.confidence < 0.5) {
    body += " (pending confirmation)";
  }

  return `${prefix}: ${body}`;
}

function summarize(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_FINDING_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_FINDING_LENGTH - 1)}…`;
}

function formatConfidence(confidence: number): string {
  if (!Number.isFinite(confidence)) return "";
  const percentage = Math.round(clamp01(confidence) * 100);
  return `(${percentage}%)`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
