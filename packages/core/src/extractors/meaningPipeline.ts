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

import type { LLMProvider } from '../llm/types';
import type { SemanticContent, Frame, Relation } from '../semantic/types';
import type { FrameExtractionTurn } from './frameExtractionPrompt';

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
      content: SemanticContent;
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
  registry: AgentRegistry
): DispatchDecision {
  const agents = registry.getAll();
  const applicable = agents.filter((a) => a.shouldRun(ctx));
  return {
    agentsToRun: applicable.map((a) => a.name),
    reason: ctx.meta.isFirstExtraction
      ? 'First extraction — running all applicable agents'
      : `Delta update — ${applicable.length} agents applicable`,
  };
}

// ── Pipeline Runner ──

export interface PipelineResult {
  content: SemanticContent;
  topicName: string | null;
  meta: PipelineContext['meta'];
}

export class MeaningPipeline {
  private registry = new AgentRegistry();
  private dispatch: (ctx: PipelineContext, reg: AgentRegistry) => DispatchDecision;

  constructor(
    private readonly provider: LLMProvider,
    dispatchFn?: (ctx: PipelineContext, reg: AgentRegistry) => DispatchDecision
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
    previousSnapshot?: SemanticContent
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
        isFirstExtraction: !previousSnapshot || previousSnapshot.frames.length === 0,
        turnCount: turns.length,
        frameCount: content.frames.length,
        completedAgents: [],
        agentErrors: [],
        totalUsage: { inputTokens: 0, outputTokens: 0 },
        stepSnapshots: [],
      },
    };

    // Save initial snapshot (raw extractor output)
    ctx.meta.stepSnapshots.push({
      agent: 'extractor_output',
      timestamp: new Date().toISOString(),
      frameCount: ctx.content.frames.length,
      content: JSON.parse(JSON.stringify(ctx.content)),
    });

    // Dispatch — decide which agents to run
    const decision = this.dispatch(ctx, this.registry);

    // Run agents in order
    let currentCtx = ctx;
    for (const agentName of decision.agentsToRun) {
      const agent = this.registry.get(agentName);
      if (!agent) continue;

      try {
        currentCtx = await agent.run(currentCtx, this.provider);
        currentCtx.meta.completedAgents.push(agentName);

        // Save snapshot after each step for human review
        currentCtx.meta.stepSnapshots.push({
          agent: agentName,
          timestamp: new Date().toISOString(),
          frameCount: currentCtx.content.frames.length,
          content: JSON.parse(JSON.stringify(currentCtx.content)), // deep clone
        });
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
    };
  }
}
