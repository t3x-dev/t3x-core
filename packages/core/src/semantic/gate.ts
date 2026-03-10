/**
 * Semantic Gate (Gate 2) — LLM-based semantic review
 *
 * Uses an LLM to review extraction quality across 5 dimensions:
 * completeness, accuracy, relations, granularity, hallucination.
 *
 * @see docs/plans/core-engine/09-gate-and-ci.md
 */

import type { LLMProvider } from '../llm/types';
import type {
  CoverageResult,
  DimensionResult,
  GateDimension,
  SemanticContent,
  SemanticGateResult,
  SemanticIssue,
} from './types';

// ── Constants ──

const GATE_DIMENSIONS: GateDimension[] = [
  'completeness',
  'accuracy',
  'relations',
  'granularity',
  'hallucination',
];

const PASS_THRESHOLD = 0.7;

// ── Prompt Builder ──

/**
 * Build the system + user prompt for semantic gate review.
 */
export function buildSemanticGatePrompt(
  turns: { role: string; content: string }[],
  content: SemanticContent
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `你是一个语义提取审查员。给你一段原始对话和从中提取的 Frame JSON。

请从以下 5 个维度评分（0-1）并列出问题：

## 1. 完整性 (Completeness)
对话中的重要意图、决定、事实、约束是否都被提取了？
- 检查：对话中每一个实质性陈述是否有对应的 frame 或 slot
- 不需要提取：寒暄、重复、过程性讨论

## 2. 准确性 (Accuracy)
提取的 slot 值是否和原文一致？
- 检查：数字、名称、日期等是否准确
- 检查：推断性内容是否标注了较低的 confidence

## 3. 关系正确性 (Relations)
frame 之间的关系类型是否正确？
- causes：A 真的导致了 B 吗？
- conditions：A 真的是 B 的前提吗？
- contrasts：A 和 B 真的矛盾/对立吗？
- elaborates：B 真的是 A 的细节吗？
- follows：A 真的在 B 之前发生吗？
- depends：A 真的依赖 B 吗？

## 4. 粒度合理性 (Granularity)
- 过度拆分：一个意图被拆成多个不必要的 frame？
- 过度合并：多个不同意图被塞进一个 frame？

## 5. 幻觉检测 (Hallucination)
- frame 中有没有原文完全没提到的内容？
- 推断是否合理？过度推断？

请严格按照以下 JSON 格式输出（不要包含其他内容）：

\`\`\`json
{
  "dimensions": {
    "completeness": { "score": 0.0, "details": "..." },
    "accuracy": { "score": 0.0, "details": "..." },
    "relations": { "score": 0.0, "details": "..." },
    "granularity": { "score": 0.0, "details": "..." },
    "hallucination": { "score": 0.0, "details": "..." }
  },
  "issues": [
    { "severity": "error|warning|info", "frame_id": "f_001", "dimension": "accuracy", "description": "...", "suggestion": "..." }
  ]
}
\`\`\``;

  // Format turns
  const turnsText = turns.map((t) => `[${t.role}]: ${t.content}`).join('\n');

  // Format semantic content as readable YAML-like text
  const framesText = content.frames
    .map((f) => {
      const slotsStr = Object.entries(f.slots)
        .map(([k, v]) => `    ${k}: ${JSON.stringify(v)}`)
        .join('\n');
      const confStr = f.confidence !== undefined ? ` (confidence: ${f.confidence})` : '';
      return `  - id: ${f.id}\n    type: ${f.type}${confStr}\n${slotsStr}`;
    })
    .join('\n');

  const relationsText =
    content.relations.length > 0
      ? content.relations.map((r) => `  - ${r.from} --[${r.type}]--> ${r.to}`).join('\n')
      : '  (none)';

  const userPrompt = `原始对话：
${turnsText}

提取的 Frames：
${framesText}

提取的 Relations：
${relationsText}

请输出：每个维度的评分（0-1）+ 具体问题列表。`;

  return { systemPrompt, userPrompt };
}

// ── Response Parser ──

/**
 * Default dimension result for missing/invalid dimensions.
 */
function defaultDimensionResult(): DimensionResult {
  return { score: 0, details: '' };
}

/**
 * Parse the LLM response into a SemanticGateResult.
 * If parsing fails, returns a degraded result with score 0.
 */
export function parseSemanticGateResponse(raw: string): SemanticGateResult {
  try {
    // Extract JSON from possible markdown code block
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw.trim();

    const parsed = JSON.parse(jsonStr);

    if (!parsed.dimensions || typeof parsed.dimensions !== 'object') {
      return buildDegradedResult('Missing dimensions in response');
    }

    // Build dimensions record with defaults for missing dimensions
    const dimensions = {} as Record<GateDimension, DimensionResult>;
    for (const dim of GATE_DIMENSIONS) {
      const raw = parsed.dimensions[dim];
      if (raw && typeof raw === 'object' && typeof raw.score === 'number') {
        dimensions[dim] = {
          score: Math.max(0, Math.min(1, raw.score)),
          details: typeof raw.details === 'string' ? raw.details : '',
        };
      } else {
        dimensions[dim] = defaultDimensionResult();
      }
    }

    // Parse issues
    const issues: SemanticIssue[] = [];
    if (Array.isArray(parsed.issues)) {
      for (const issue of parsed.issues) {
        if (issue && typeof issue === 'object' && typeof issue.description === 'string') {
          const severity =
            issue.severity === 'error' || issue.severity === 'warning' || issue.severity === 'info'
              ? issue.severity
              : 'warning';
          const dimension = GATE_DIMENSIONS.includes(issue.dimension)
            ? (issue.dimension as GateDimension)
            : 'accuracy';
          issues.push({
            severity,
            frame_id: typeof issue.frame_id === 'string' ? issue.frame_id : undefined,
            dimension,
            description: issue.description,
            suggestion: typeof issue.suggestion === 'string' ? issue.suggestion : undefined,
          });
        }
      }
    }

    // Calculate overall score (average of all dimensions)
    const scores = GATE_DIMENSIONS.map((d) => dimensions[d].score);
    const score = scores.reduce((sum, s) => sum + s, 0) / scores.length;

    return {
      passed: score >= PASS_THRESHOLD,
      score,
      dimensions,
      issues,
    };
  } catch {
    return buildDegradedResult('Failed to parse LLM response as JSON');
  }
}

/**
 * Build a degraded result when parsing fails.
 */
function buildDegradedResult(errorMessage: string): SemanticGateResult {
  const dimensions = {} as Record<GateDimension, DimensionResult>;
  for (const dim of GATE_DIMENSIONS) {
    dimensions[dim] = defaultDimensionResult();
  }
  return {
    passed: false,
    score: 0,
    dimensions,
    issues: [
      {
        severity: 'error',
        dimension: 'accuracy',
        description: errorMessage,
      },
    ],
  };
}

// ── Coverage Prompt ──

/**
 * Build the system + user prompt for coverage checking.
 */
export function buildCoveragePrompt(
  turns: { role: string; content: string }[],
  content: SemanticContent
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `你是一个语义提取覆盖度审查员。给你一段原始对话和从中提取的 Frame JSON。

你的任务：检查原始对话中是否有重要信息被遗漏，没有被任何 Frame 覆盖。

## 判断标准
- 重要信息：意图、决定、事实、约束、数字、时间、人名、具体需求
- 不重要（可忽略）：寒暄、重复、语气词、过程性讨论（如"嗯"、"好的"、"让我想想"）

## 输出格式
严格按照以下 JSON 格式输出（不要包含其他内容）：

\`\`\`json
{
  "coverage_ratio": 0.85,
  "uncovered_segments": ["原文中未被覆盖的重要文本片段1", "原文中未被覆盖的重要文本片段2"]
}
\`\`\`

- coverage_ratio: 0-1，重要信息被覆盖的比例
- uncovered_segments: 未被覆盖的重要原文片段（直接引用原文）
- 如果全部覆盖，返回 coverage_ratio: 1.0, uncovered_segments: []`;

  const turnsText = turns.map((t) => `[${t.role}]: ${t.content}`).join('\n');

  const framesText = content.frames
    .map((f) => {
      const slotsStr = Object.entries(f.slots)
        .map(([k, v]) => `    ${k}: ${JSON.stringify(v)}`)
        .join('\n');
      return `  - id: ${f.id}\n    type: ${f.type}\n${slotsStr}`;
    })
    .join('\n');

  const userPrompt = `原始对话：
${turnsText}

提取的 Frames：
${framesText}

请判断覆盖度并输出 JSON。`;

  return { systemPrompt, userPrompt };
}

// ── Coverage Parser ──

/**
 * Parse the LLM response into a CoverageResult.
 * Returns zero coverage if parsing fails.
 */
export function parseCoverageResponse(raw: string): CoverageResult {
  try {
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw.trim();
    const parsed = JSON.parse(jsonStr);

    const ratio =
      typeof parsed.coverage_ratio === 'number'
        ? Math.max(0, Math.min(1, parsed.coverage_ratio))
        : 0;

    const segments = Array.isArray(parsed.uncovered_segments)
      ? parsed.uncovered_segments.filter((s: unknown) => typeof s === 'string')
      : [];

    return { coverage_ratio: ratio, uncovered_segments: segments };
  } catch {
    return { coverage_ratio: 0, uncovered_segments: [] };
  }
}

// ── SemanticGate Class ──

/**
 * Semantic Gate (Gate 2) — LLM-based extraction quality review.
 *
 * Scoring thresholds:
 * - >= 0.9: auto pass
 * - 0.7-0.9: pass with warnings
 * - 0.5-0.7: pause, needs user attention
 * - < 0.5: reject
 */
export class SemanticGate {
  constructor(private readonly provider: LLMProvider) {}

  /**
   * Review semantic content extracted from conversation turns.
   *
   * @param turns - The original conversation turns
   * @param content - The extracted semantic content (frames + relations)
   * @returns Semantic gate result with scores and issues
   */
  async review(
    turns: { role: string; content: string }[],
    content: SemanticContent
  ): Promise<SemanticGateResult> {
    const { systemPrompt, userPrompt } = buildSemanticGatePrompt(turns, content);
    const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

    try {
      const raw = await this.provider.generate(fullPrompt, {
        temperature: 0.1,
        maxTokens: 2000,
      });
      return parseSemanticGateResponse(raw);
    } catch {
      return buildDegradedResult('LLM provider call failed');
    }
  }

  /**
   * Check coverage of extracted frames against original conversation.
   *
   * @param turns - The original conversation turns
   * @param content - The extracted semantic content (frames + relations)
   * @returns Coverage result with ratio and uncovered segments
   */
  async checkCoverage(
    turns: { role: string; content: string }[],
    content: SemanticContent
  ): Promise<CoverageResult> {
    const { systemPrompt, userPrompt } = buildCoveragePrompt(turns, content);
    const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

    try {
      const raw = await this.provider.generate(fullPrompt, {
        temperature: 0.1,
        maxTokens: 1500,
      });
      return parseCoverageResponse(raw);
    } catch {
      return { coverage_ratio: 0, uncovered_segments: [] };
    }
  }
}
