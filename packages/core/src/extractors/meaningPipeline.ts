/**
 * Meaning Pipeline — Agent orchestration framework for semantic extraction.
 *
 * Design:
 * - Each agent does ONE focused job (extract, name, polish, dedup, etc.)
 * - Dispatcher decides which agents to run based on context
 * - Agents are registered in a registry, can be added/removed anytime
 * - Pipeline context flows through agents, each transforms it
 * - Code steps (nesting, merging) are also agents — just deterministic ones
 * - Fallback: if any agent fails, pipeline continues with what it has
 *
 * Principles:
 * - LLM for judgment, CODE for transformation
 * - Each LLM agent: simple prompt → simple output
 * - Fail gracefully — partial result > no result
 */

import type { LLMCallLogger, LLMProvider } from '../llm/types';
import type { Frame, Relation, SemanticContent, SlotValue } from '../semantic/types';
import type { FrameExtractionTurn } from './frameExtractionPrompt';

// ── Pipeline Mode ──

export type PipelineMode = 'full' | 'incremental';

export interface PipelineOptions {
  mode?: PipelineMode;
  /** Agent names to skip (e.g., ['slot_polisher', 'reviewer']) */
  disabledAgents?: string[];
  /** Enable structured console logging for each stage */
  debug?: boolean;
  /** Optional callback to log every LLM call (prompt/response/tokens/duration) */
  llmLogger?: LLMCallLogger;
}

// ── Pipeline Context ──

export interface PipelineContext {
  /** Conversation turns */
  turns: FrameExtractionTurn[];
  /** Current snapshot (before this extraction) */
  previousSnapshot: SemanticContent | undefined;
  /** Working content — agents modify this as pipeline progresses */
  content: SemanticContent;
  /** The root topic name (set by Topic Namer agent) */
  topicName: string | null;
  /** Conversation summary for context (first ~200 chars) */
  conversationSummary: string;
  /** Pipeline metadata */
  meta: {
    mode: PipelineMode;
    isFirstExtraction: boolean;
    turnCount: number;
    frameCount: number;
    /** Which agents have run */
    completedAgents: string[];
    /** Agent errors (non-fatal) */
    agentErrors: Array<{ agent: string; error: string }>;
    /** Total LLM usage across all agents */
    totalUsage: { inputTokens: number; outputTokens: number };
    /** Snapshot after each agent step — for human review and debugging */
    stepSnapshots: Array<{
      agent: string;
      timestamp: string;
      frameCount: number;
      quality: QualityMetrics;
      content: SemanticContent;
      durationMs?: number;
    }>;
  };
}

// ── Agent Interface ──

export interface MeaningAgent {
  /** Unique name for this agent */
  name: string;
  /** Human-readable description */
  description: string;
  /** Whether this agent uses LLM (true) or is deterministic code (false) */
  usesLLM: boolean;
  /**
   * Should this agent run given the current context?
   * The dispatcher calls this for each agent to build the execution plan.
   */
  shouldRun(ctx: PipelineContext): boolean;
  /**
   * Execute the agent. Modifies context in place or returns updated context.
   * If the agent fails, it should throw — the pipeline will catch and continue.
   */
  run(ctx: PipelineContext, provider: LLMProvider): Promise<PipelineContext>;
}

// ── Agent Registry ──

export class AgentRegistry {
  private agents: MeaningAgent[] = [];

  register(agent: MeaningAgent): void {
    // Replace if same name exists
    this.agents = this.agents.filter((a) => a.name !== agent.name);
    this.agents.push(agent);
  }

  remove(name: string): void {
    this.agents = this.agents.filter((a) => a.name !== name);
  }

  getAll(): MeaningAgent[] {
    return [...this.agents];
  }

  get(name: string): MeaningAgent | undefined {
    return this.agents.find((a) => a.name === name);
  }
}

// ── Dispatcher ──

export type DispatchStrategy = 'all-applicable' | 'minimal' | 'custom';

export interface DispatchDecision {
  agentsToRun: string[];
  reason: string;
}

/**
 * Default dispatcher — rule-based, picks agents based on context.
 * Can be replaced with LLM-based dispatcher later.
 */
export function defaultDispatch(
  ctx: PipelineContext,
  registry: AgentRegistry,
  options?: PipelineOptions
): DispatchDecision {
  const disabled = new Set(options?.disabledAgents ?? []);
  const agents = registry.getAll();
  const applicable = agents.filter((a) => !disabled.has(a.name)).filter((a) => a.shouldRun(ctx));
  const llmCount = applicable.filter((a) => a.usesLLM).length;
  const mode = ctx.meta.mode;
  return {
    agentsToRun: applicable.map((a) => a.name),
    reason:
      mode === 'incremental'
        ? `Incremental mode — ${applicable.length} agents (${llmCount} LLM)`
        : `Full mode — ${applicable.length} agents (${llmCount} LLM)`,
  };
}

// ── Provider Debug Wrapper ──

/**
 * Wraps an LLMProvider to call the logger on every generate() invocation.
 * Lightweight — only used when llmLogger is provided.
 */
function wrapProviderWithLogger(
  provider: LLMProvider,
  logger: LLMCallLogger,
  agentLabel: string
): LLMProvider {
  return {
    id: provider.id,
    generate: async (prompt, genOptions) => {
      const start = Date.now();
      const result = await provider.generate(prompt, genOptions);
      logger({
        agent: agentLabel,
        prompt,
        response: result.text,
        usage: result.usage,
        durationMs: Date.now() - start,
      });
      return result;
    },
    resolveConflict: provider.resolveConflict.bind(provider),
    // Forward optional methods if the original provider implements them
    ...(provider.generateFromPrompt && {
      generateFromPrompt: provider.generateFromPrompt.bind(provider),
    }),
    ...(provider.generateStructured && {
      generateStructured: provider.generateStructured.bind(provider),
    }),
  };
}

// ── Pipeline Runner ──

// ── Quality Metrics ──

export interface QualityMetrics {
  /** Total number of frames */
  frameCount: number;
  /** Maximum nesting depth */
  maxDepth: number;
  /** Number of unique frame types */
  uniqueTypes: number;
  /** Number of duplicate frame types */
  duplicateTypes: number;
  /** Average slots per frame */
  avgSlotsPerFrame: number;
  /** Frames with arrays (good — consolidated) */
  framesWithArrays: number;
  /** Overall quality score 0-100 */
  score: number;
}

function computeMetrics(content: SemanticContent): QualityMetrics {
  const frames = content.frames;
  const typeCount = new Map<string, number>();
  let totalSlots = 0;
  let framesWithArrays = 0;
  let maxDepth = 0;

  function measureDepth(slots: Record<string, SlotValue>, depth: number): number {
    let max = depth;
    for (const value of Object.values(slots)) {
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        'type' in value &&
        'slots' in value
      ) {
        const d = measureDepth((value as { slots: Record<string, SlotValue> }).slots, depth + 1);
        if (d > max) max = d;
      }
    }
    return max;
  }

  for (const frame of frames) {
    typeCount.set(frame.type, (typeCount.get(frame.type) ?? 0) + 1);
    const slotKeys = Object.keys(frame.slots);
    totalSlots += slotKeys.length;

    const hasArray = Object.values(frame.slots).some((v) => Array.isArray(v));
    if (hasArray) framesWithArrays++;

    const depth = measureDepth(frame.slots, 1);
    if (depth > maxDepth) maxDepth = depth;
  }

  const duplicateTypes = [...typeCount.values()].filter((c) => c > 1).length;
  const avgSlotsPerFrame = frames.length > 0 ? totalSlots / frames.length : 0;

  // Score: penalize too many frames, duplicates, shallow nesting
  let score = 100;
  if (frames.length > 8) score -= (frames.length - 8) * 5; // Too many frames
  if (frames.length > 15) score -= 20; // Way too many
  if (duplicateTypes > 0) score -= duplicateTypes * 10; // Duplicates bad
  if (maxDepth < 2 && frames.length > 3) score -= 15; // Too flat
  if (avgSlotsPerFrame < 2) score -= 10; // Too thin
  if (framesWithArrays > 0) score += 5; // Arrays good
  score = Math.max(0, Math.min(100, score));

  return {
    frameCount: frames.length,
    maxDepth,
    uniqueTypes: typeCount.size,
    duplicateTypes,
    avgSlotsPerFrame: Math.round(avgSlotsPerFrame * 10) / 10,
    framesWithArrays,
    score,
  };
}

// ── Pipeline Result ──

export interface PipelineResult {
  content: SemanticContent;
  topicName: string | null;
  meta: PipelineContext['meta'];
  /** Quality metrics for the final output */
  quality: QualityMetrics;
}

export class MeaningPipeline {
  private registry = new AgentRegistry();
  private dispatch: (
    ctx: PipelineContext,
    reg: AgentRegistry,
    options?: PipelineOptions
  ) => DispatchDecision;

  constructor(
    private readonly provider: LLMProvider,
    dispatchFn?: (
      ctx: PipelineContext,
      reg: AgentRegistry,
      options?: PipelineOptions
    ) => DispatchDecision
  ) {
    this.dispatch = dispatchFn ?? defaultDispatch;
  }

  /** Register an agent */
  register(agent: MeaningAgent): this {
    this.registry.register(agent);
    return this;
  }

  /** Remove an agent by name */
  remove(name: string): this {
    this.registry.remove(name);
    return this;
  }

  /** Run the pipeline */
  async run(
    content: SemanticContent,
    turns: FrameExtractionTurn[],
    previousSnapshot?: SemanticContent,
    options?: PipelineOptions
  ): Promise<PipelineResult> {
    // Build initial context
    const ctx: PipelineContext = {
      turns,
      previousSnapshot,
      content: { ...content, frames: [...content.frames], relations: [...content.relations] },
      topicName: null,
      conversationSummary: turns
        .filter((t) => t.role === 'user')
        .map((t) => t.content)
        .join(' ')
        .slice(0, 300),
      meta: {
        mode: options?.mode ?? 'full',
        isFirstExtraction: !previousSnapshot || previousSnapshot.frames.length === 0,
        turnCount: turns.length,
        frameCount: content.frames.length,
        completedAgents: [],
        agentErrors: [],
        totalUsage: { inputTokens: 0, outputTokens: 0 },
        stepSnapshots: [],
      },
    };

    // Save initial snapshot with quality metrics
    const initialMetrics = computeMetrics(ctx.content);
    ctx.meta.stepSnapshots.push({
      agent: 'extractor_output',
      timestamp: new Date().toISOString(),
      frameCount: ctx.content.frames.length,
      quality: initialMetrics,
      content: JSON.parse(JSON.stringify(ctx.content)),
    });

    // Dispatch — decide which agents to run
    const decision = this.dispatch(ctx, this.registry, options);

    if (options?.debug) {
      console.info(
        `[pipeline] Mode: ${ctx.meta.mode} | Agents: ${decision.agentsToRun.join(' → ')}`
      );
    }

    // Run agents in order with validation gates
    let currentCtx = ctx;
    for (const agentName of decision.agentsToRun) {
      const agent = this.registry.get(agentName);
      if (!agent) continue;

      // Save pre-agent state for rollback
      const preAgentContent = JSON.parse(JSON.stringify(currentCtx.content)) as SemanticContent;
      const preMetrics = computeMetrics(preAgentContent);

      try {
        // Wrap provider with debug logging if llmLogger is provided
        const agentProvider = options?.llmLogger
          ? wrapProviderWithLogger(this.provider, options.llmLogger, agentName)
          : this.provider;

        const startTime = Date.now();
        currentCtx = await agent.run(currentCtx, agentProvider);
        const durationMs = Date.now() - startTime;

        // Validation gate: did this agent make things better or worse?
        const postMetrics = computeMetrics(currentCtx.content);

        if (currentCtx.content.frames.length === 0 && preAgentContent.frames.length > 0) {
          // Agent wiped all frames — rollback
          currentCtx.content = preAgentContent;
          currentCtx.meta.agentErrors.push({
            agent: agentName,
            error: 'ROLLBACK: agent produced 0 frames, reverted to pre-agent state',
          });
        } else if (postMetrics.score < preMetrics.score - 20) {
          // Quality dropped significantly — rollback
          currentCtx.content = preAgentContent;
          currentCtx.meta.agentErrors.push({
            agent: agentName,
            error: `ROLLBACK: quality dropped ${preMetrics.score}→${postMetrics.score}, reverted`,
          });
        } else {
          currentCtx.meta.completedAgents.push(agentName);
        }

        // Save snapshot with quality metrics
        const snapshotMetrics = computeMetrics(currentCtx.content);
        currentCtx.meta.stepSnapshots.push({
          agent: agentName,
          timestamp: new Date().toISOString(),
          frameCount: currentCtx.content.frames.length,
          quality: snapshotMetrics,
          content: JSON.parse(JSON.stringify(currentCtx.content)),
          durationMs,
        });

        // Structured debug log
        if (options?.debug) {
          const delta = snapshotMetrics.score - preMetrics.score;
          const sign = delta >= 0 ? '+' : '';
          const warn = delta < -3 ? ' ⚠' : '';
          console.info(
            `[pipeline] %-22s | frames: %d→%d | quality: %d→%d (%s%d)%s | %dms`,
            agentName,
            preAgentContent.frames.length,
            currentCtx.content.frames.length,
            preMetrics.score,
            snapshotMetrics.score,
            sign,
            delta,
            warn,
            durationMs
          );
        }
      } catch (err) {
        // Non-fatal — log error and continue with what we have
        currentCtx.meta.agentErrors.push({
          agent: agentName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      content: currentCtx.content,
      topicName: currentCtx.topicName,
      meta: currentCtx.meta,
      quality: computeMetrics(currentCtx.content),
    };
  }
}
