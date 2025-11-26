import { runExtractors, ExtractedItem } from "./extract";
import { scoreBm25 } from "./bm25";
import { scoreRecency } from "./recency";
import { combineScore, ScoreComponents } from "./score";
import type { EmbeddingModel } from "./models/embeddings";
import { MiniLmxEnovaModel } from "./models/minilm_xenova";
import { greedyCluster } from "./cluster";
import { createLabel } from "./label";
import { renderBullets } from "./draft";

export interface Turn {
  id: string;
  text: string;
  role?: string;
  timestamp?: string;
}

export interface Aspect {
  id: string;
  title: string;
  findings: ExtractedItem[];
  confidence: number;
  meta?: Record<string, unknown>;
}

export interface AspectsEngineOptions {
  goal?: string;
  model?: string;
  pin?: string;
  referenceTimestamp?: Date | string;
  embeddingModelName?: string;
  clusterThreshold?: number;
}

const TOKEN_SPLIT_REGEX = /[,\s、，。．\.!?！？;；:：()\[\]{}<>「」“”"']+/u;
const DEFAULT_CLUSTER_THRESHOLD = 0.8;

export async function runAspectsEngine(turns: Turn[], options: AspectsEngineOptions = {}): Promise<Aspect[]> {
  const turnContexts = turns.map(turn => ({
    turn,
    tokens: tokenize(turn.text),
    timestamp: parseTimestamp(turn.timestamp),
  }));

  const documents = turnContexts.filter(context => context.tokens.length > 0);
  const totalDocuments = documents.length || 1;
  const documentFrequency = computeDocumentFrequency(documents);
  const totalTokenCount = documents.reduce((sum, context) => sum + context.tokens.length, 0);
  const averageDocumentLength = totalTokenCount > 0 ? totalTokenCount / totalDocuments : 1;

  const referenceTimestamp =
    typeof options.referenceTimestamp === "string"
      ? parseTimestamp(options.referenceTimestamp)
      : options.referenceTimestamp ?? new Date();

  const contextsById = new Map<string, { tokens: string[]; timestamp?: Date; role?: string; text: string }>();
  for (const context of turnContexts) {
    contextsById.set(context.turn.id, {
      tokens: context.tokens,
      timestamp: context.timestamp,
      role: context.turn.role,
      text: context.turn.text,
    });
  }

  const findings = turnContexts.flatMap(context =>
    runExtractors(context.turn).map(item => ({
      ...item,
      meta: {
        ...(item.meta ?? {}),
        sourceTurnRole: context.turn.role,
        sourceTurnTimestamp: context.turn.timestamp,
      },
    })),
  );

  const mutableFindings: MutableFinding[] = findings.map(item => ({ ...item }));

  const embeddingModel = new MiniLmxEnovaModel(options.embeddingModelName);
  await attachCosineScores(mutableFindings, contextsById, embeddingModel);

  const stats = {
    documentFrequency,
    totalDocuments,
    averageDocumentLength,
  };

  const enrichedFindings: EnrichedFinding[] = mutableFindings.map((finding, index) => {
    const context = contextsById.get(finding.turnId) ?? { tokens: [], timestamp: undefined, role: undefined, text: "" };
    const components = buildScoreComponents(finding, context, stats, referenceTimestamp);
    const confidence = combineScore(components);
    return {
      id: `finding-${index.toString().padStart(4, "0")}`,
      finding,
      context,
      components,
      confidence,
      tokens: tokenize(finding.text),
    };
  });

  const clusterThreshold =
    typeof options.clusterThreshold === "number" ? options.clusterThreshold : DEFAULT_CLUSTER_THRESHOLD;
  const clusterInputs = enrichedFindings
    .filter(item => item.finding.embeddingVector && item.finding.embeddingVector.length > 0)
    .map(item => ({
      id: item.id,
      vector: item.finding.embeddingVector ?? [],
    }));

  const clusterResults = clusterInputs.length ? greedyCluster(clusterInputs, clusterThreshold) : [];
  const idToFinding = new Map<string, EnrichedFinding>();
  enrichedFindings.forEach(item => idToFinding.set(item.id, item));

  const assigned = new Set<string>();
  const aspects: Aspect[] = [];
  let aspectIndex = 0;

  for (const cluster of clusterResults) {
    const members = cluster.memberIds
      .map(id => idToFinding.get(id))
      .filter((value): value is EnrichedFinding => Boolean(value));
    if (members.length === 0) continue;

    members.forEach(member => assigned.add(member.id));

    const confidence = average(members.map(member => member.confidence));
    const { id: aspectId, title } = createAspectLabel(members, `cluster-${cluster.clusterId}`);
    const findingTexts = members.map(member => member.finding.text);
    const summaryBullets = renderBullets([
      {
        aspectId,
        title,
        findings: findingTexts,
        confidence,
      },
    ]);

    aspects.push({
      id: `aspect-${aspectIndex.toString().padStart(4, "0")}`,
      title,
      findings: members.map(member => sanitizeFinding(member.finding)),
      confidence,
      meta: {
        kinds: collectKinds(members),
        size: members.length,
        summary: summaryBullets,
      },
    });
    aspectIndex += 1;
  }

  for (const finding of enrichedFindings) {
    if (assigned.has(finding.id)) continue;
    aspects.push({
      id: `aspect-${aspectIndex.toString().padStart(4, "0")}`,
      title: finding.finding.text,
      findings: [sanitizeFinding(finding.finding)],
      confidence: finding.confidence,
      meta: {
        kind: finding.finding.kind,
      },
    });
    aspectIndex += 1;
  }

  return aspects;
}

interface BuildContext {
  tokens: string[];
  timestamp?: Date;
  role?: string;
  text?: string;
}

interface MutableFinding extends ExtractedItem {
  embeddingVector?: number[];
}

interface EnrichedFinding {
  id: string;
  finding: MutableFinding;
  context: BuildContext & { text: string };
  components: ScoreComponents;
  confidence: number;
  tokens: string[];
}

function buildScoreComponents(
  finding: ExtractedItem,
  context: BuildContext,
  stats: {
    documentFrequency: Record<string, number>;
    totalDocuments: number;
    averageDocumentLength: number;
  },
  referenceTimestamp?: Date,
): ScoreComponents {
  const queryTokens = tokenize(finding.text);
  const bm25 = queryTokens.length ? scoreBm25(queryTokens, context.tokens ?? [], stats) : 0;

  const recency = referenceTimestamp && context.timestamp ? scoreRecency(context.timestamp, referenceTimestamp) : 0;

  const role =
    typeof context.role === "string"
      ? context.role
      : typeof finding.meta?.sourceTurnRole === "string"
      ? String(finding.meta?.sourceTurnRole)
      : undefined;

  return {
    cosine: typeof finding.score === "number" ? finding.score : 0,
    bm25,
    recency,
    role,
  };
}

function tokenize(text: string): string[] {
  return text
    .split(TOKEN_SPLIT_REGEX)
    .map(token => token.trim())
    .filter(token => token.length > 0);
}

function parseTimestamp(value?: string | Date): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed;
}

function computeDocumentFrequency(documents: Array<{ tokens: string[] }>): Record<string, number> {
  const frequency: Record<string, number> = Object.create(null);
  for (const doc of documents) {
    const unique = new Set(doc.tokens);
    for (const token of unique) {
      frequency[token] = (frequency[token] ?? 0) + 1;
    }
  }
  return frequency;
}

async function attachCosineScores(
  findings: MutableFinding[],
  contextsById: Map<string, { tokens: string[]; timestamp?: Date; role?: string; text: string }>,
  embeddingModel: EmbeddingModel,
): Promise<void> {
  const cache = new Map<string, number[]>();

  const getEmbedding = async (text: string): Promise<number[]> => {
    const cached = cache.get(text);
    if (cached) return cached;

    const vectors = await embeddingModel.embed([text]);
    const vector = vectors[0] ? vectors[0] : [];
    cache.set(text, vector);
    return vector;
  };

  for (const finding of findings) {
    const context = contextsById.get(finding.turnId);
    if (!context?.text) {
      finding.score = 0;
      finding.embeddingVector = [];
      continue;
    }

    const [findingVector, turnVector] = await Promise.all([
      getEmbedding(finding.text),
      getEmbedding(context.text),
    ]);

    finding.score = cosineSimilarity(findingVector, turnVector);
    finding.embeddingVector = findingVector;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i++) {
    const va = a[i];
    const vb = b[i];
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }

  if (normA === 0 || normB === 0) return 0;
  const cosine = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  if (!Number.isFinite(cosine)) return 0;
  return Math.max(-1, Math.min(1, cosine));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0);
  return sum / values.length;
}

function sanitizeFinding(finding: MutableFinding): ExtractedItem {
  const { turnId, text, kind, score, meta } = finding;
  return {
    turnId,
    text,
    kind,
    score,
    meta,
  };
}

function collectKinds(members: EnrichedFinding[]): string[] {
  const kinds = new Set<string>();
  members.forEach(member => {
    if (member.finding.kind) {
      kinds.add(member.finding.kind);
    }
  });
  return Array.from(kinds);
}

function createAspectLabel(members: EnrichedFinding[], fallbackId: string): { id: string; title: string } {
  const tokens = members.flatMap(member => member.tokens);
  const entities = members
    .map(member => {
      const candidate = member.finding.meta?.entity;
      return typeof candidate === "string" ? candidate : undefined;
    })
    .filter((value): value is string => Boolean(value));

  const title = createLabel({ tokens, entities }, 80);
  return {
    id: members[0]?.id ?? fallbackId,
    title,
  };
}
