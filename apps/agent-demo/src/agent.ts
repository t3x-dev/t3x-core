import { type EmailArgs, sendEmail } from './tools/email.js';

export interface TraceEvent {
  type: 'step' | 'tool_call' | 'tool_result' | 'error';
  name: string;
  ok: boolean;
  args?: unknown;
  result?: unknown;
  latency_ms?: number;
  error?: string;
}

export interface AgentInput {
  case_id: string;
  input: string;
  context: {
    meeting_notes?: string;
    recipient?: string;
    [key: string]: unknown;
  };
  leaf?: {
    leaf_id: string;
    commit_hash: string;
    mode: string;
  };
}

export interface AgentOutput {
  output: {
    summary: string;
    email?: {
      to: string;
      subject: string;
      body: string;
    };
  };
  trace_events: TraceEvent[];
}

/**
 * Demo Agent: Summarize + Email
 *
 * This is a simple deterministic agent for testing t3x-runner.
 * In production, you'd replace the summarize logic with actual LLM calls.
 */
export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const traceEvents: TraceEvent[] = [];
  const _startTime = Date.now();

  // Step 1: Summarize
  const summarizeStart = Date.now();
  let summary: string;

  try {
    summary = summarize(input.context.meeting_notes || input.input);
    traceEvents.push({
      type: 'step',
      name: 'summarize',
      ok: true,
      latency_ms: Date.now() - summarizeStart,
    });
  } catch (error) {
    traceEvents.push({
      type: 'step',
      name: 'summarize',
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      latency_ms: Date.now() - summarizeStart,
    });
    throw error;
  }

  // Step 2: Send email (if recipient provided)
  let emailResult: { to: string; subject: string; body: string } | undefined;

  if (input.context.recipient) {
    const emailArgs: EmailArgs = {
      to: input.context.recipient,
      subject: generateSubject(input.input),
      body: generateEmailBody(summary),
    };

    // Record tool call
    traceEvents.push({
      type: 'tool_call',
      name: 'email.send',
      ok: true,
      args: emailArgs as unknown as Record<string, unknown>,
    });

    const toolStart = Date.now();
    try {
      const result = sendEmail(emailArgs);
      traceEvents.push({
        type: 'tool_result',
        name: 'email.send',
        ok: true,
        result,
        latency_ms: Date.now() - toolStart,
      });

      emailResult = emailArgs;
    } catch (error) {
      traceEvents.push({
        type: 'tool_result',
        name: 'email.send',
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        latency_ms: Date.now() - toolStart,
      });
      throw error;
    }
  }

  return {
    output: {
      summary,
      email: emailResult,
    },
    trace_events: traceEvents,
  };
}

/**
 * Simple summarization (mock - replace with LLM in production)
 */
function summarize(text: string): string {
  // Extract key points (simple heuristic)
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  if (sentences.length <= 2) {
    return text.trim();
  }

  // Take first sentence + any sentence with key words
  const keyWords = ['timeline', 'deadline', 'risk', 'decision', 'action', 'next', 'important'];
  const important = sentences.filter((s) => keyWords.some((kw) => s.toLowerCase().includes(kw)));

  const summary = [sentences[0], ...important.slice(0, 2)]
    .map((s) => s.trim())
    .filter((s, i, arr) => arr.indexOf(s) === i) // dedupe
    .join('. ');

  return summary + '.';
}

/**
 * Generate email subject from input
 */
function generateSubject(input: string): string {
  if (input.toLowerCase().includes('follow-up')) {
    return 'Follow-up';
  }
  if (input.toLowerCase().includes('meeting')) {
    return 'Meeting Summary';
  }
  return 'Summary';
}

/**
 * Generate email body from summary
 */
function generateEmailBody(summary: string): string {
  return `Hi,

Here's the summary you requested:

${summary}

Best regards,
Agent Demo`;
}
