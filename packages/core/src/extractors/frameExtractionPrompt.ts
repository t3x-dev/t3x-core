/**
 * Frame Extraction Prompt Builder
 *
 * Constructs system + user prompts for LLM-based frame semantic extraction.
 * Supports two modes:
 * - First extraction (no snapshot): asks LLM for full frames + relations output
 * - Delta mode (with snapshot): asks LLM for incremental changes only
 */

import type { Frame, SemanticContent } from '../semantic/types';

// ── Input Types ──

export interface FrameExtractionTurn {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
}

export interface FrameExtractionInput {
  turns: FrameExtractionTurn[];
  snapshot?: SemanticContent;
}

// ── Output Type ──

export interface FrameExtractionPromptResult {
  systemPrompt: string;
  userPrompt: string;
}

// ── Internal Helpers ──

/**
 * Calculate the next frame ID from existing frames.
 * Frame IDs follow the pattern f_001, f_002, etc.
 */
function calcNextFrameId(frames: Frame[]): string {
  if (frames.length === 0) return 'f_001';
  let max = 0;
  for (const f of frames) {
    const match = f.id.match(/^f_(\d+)$/);
    if (match) {
      const num = Number.parseInt(match[1], 10);
      if (num > max) max = num;
    }
  }
  return `f_${String(max + 1).padStart(3, '0')}`;
}

/**
 * Serialize a snapshot to a YAML-like readable text format.
 */
function serializeSnapshot(snapshot: SemanticContent): string {
  const lines: string[] = [];

  lines.push('frames:');
  for (const frame of snapshot.frames) {
    lines.push(`  - id: ${frame.id}`);
    lines.push(`    type: ${frame.type}`);
    lines.push('    slots:');
    for (const [key, value] of Object.entries(frame.slots)) {
      lines.push(`      ${key}: ${JSON.stringify(value)}`);
    }
    if (frame.confidence !== undefined) {
      lines.push(`    confidence: ${frame.confidence}`);
    }
    if (frame.source !== undefined) {
      lines.push(`    source: ${frame.source}`);
    }
  }

  if (snapshot.relations.length > 0) {
    lines.push('relations:');
    for (const rel of snapshot.relations) {
      lines.push(`  - from: ${rel.from}`);
      lines.push(`    to: ${rel.to}`);
      lines.push(`    type: ${rel.type}`);
      if (rel.confidence !== undefined) {
        lines.push(`    confidence: ${rel.confidence}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Format conversation turns for prompt inclusion.
 */
function formatTurns(turns: FrameExtractionTurn[]): string {
  return turns.map((t) => `[${t.role}]: ${t.content}`).join('\n');
}

// ── Shared prompt fragments ──

const FRAME_NAMING_RULES = `## Frame 命名规则
- type 使用 snake_case
- type 是名词或名词短语
- id 格式: f_001, f_002, ...`;

const RELATION_RULES = `## 关系判断规则（优先级）
1. 因果 → causes
2. 前置条件 → conditions
3. 矛盾/对立/替代 → contrasts
4. 时间先后（非因果） → follows
5. 引用依赖 → depends
6. 其他关联 → elaborates`;

// ── System Prompts ──

const DELTA_SYSTEM_PROMPT = `你是一个语义提取引擎。你的任务是从新对话中提取语义变更（delta），而不是重新生成全量。

## 输出规则
1. 只输出 changes（delta），不要重复没变的 frame
2. 一个独立的意图/结论/事实 = 一个 frame
3. 过程性讨论不保留，只保留结果
4. 修改已有 frame 的 slot → update + 只写变了的 slot
5. 全新话题 → add
6. 明确否定 → remove
7. relation type 只能从 6 种中选：causes | conditions | contrasts | elaborates | follows | depends

${FRAME_NAMING_RULES}

${RELATION_RULES}

## JSON 输出格式
\`\`\`json
{
  "changes": [
    { "action": "add", "frame": { "id": "f_xxx", "type": "...", "slots": { ... }, "confidence": 0.9 } },
    { "action": "update", "target": "f_001", "slots": { "changed_key": "new_value" } },
    { "action": "remove", "target": "f_002", "reason": "..." }
  ],
  "new_relations": [
    { "from": "f_001", "to": "f_003", "type": "causes", "confidence": 0.8 }
  ]
}
\`\`\`
只输出 JSON，不要输出 markdown 围栏或其他说明文字。`;

const FIRST_EXTRACTION_SYSTEM_PROMPT = `你是一个语义提取引擎。你的任务是从对话中提取所有语义 frames 和 relations。

## 输出规则
1. 一个独立的意图/结论/事实 = 一个 frame
2. 过程性讨论不保留，只保留结果
3. relation type 只能从 6 种中选：causes | conditions | contrasts | elaborates | follows | depends

${FRAME_NAMING_RULES}（从 f_001 开始编号）

${RELATION_RULES}

## JSON 输出格式
\`\`\`json
{
  "frames": [
    { "id": "f_001", "type": "...", "slots": { ... }, "confidence": 0.9 }
  ],
  "relations": [
    { "from": "f_001", "to": "f_002", "type": "causes", "confidence": 0.8 }
  ]
}
\`\`\`
只输出 JSON，不要输出 markdown 围栏或其他说明文字。`;

// ── Main Function ──

/**
 * Build system + user prompts for frame semantic extraction.
 *
 * When `snapshot` is provided, produces delta-mode prompts that ask the LLM
 * to output only changes relative to the existing snapshot.
 * When no snapshot, produces first-extraction prompts for full output.
 */
export function buildFrameExtractionPrompt(
  input: FrameExtractionInput
): FrameExtractionPromptResult {
  const { turns, snapshot } = input;

  if (snapshot) {
    // Delta mode
    const nextId = calcNextFrameId(snapshot.frames);
    const snapshotYaml = serializeSnapshot(snapshot);
    const turnsText = formatTurns(turns);

    const userPrompt = `## 当前快照
${snapshotYaml}

## 新对话
${turnsText}

## 请输出 delta
按照规则输出 changes 和 new_relations。只输出变化的部分。
新增 frame 的 id 从 ${nextId} 开始。`;

    return { systemPrompt: DELTA_SYSTEM_PROMPT, userPrompt };
  }

  // First extraction mode
  const turnsText = formatTurns(turns);

  const userPrompt = `## 对话
${turnsText}

## 请提取所有 frames 和 relations`;

  return { systemPrompt: FIRST_EXTRACTION_SYSTEM_PROMPT, userPrompt };
}
