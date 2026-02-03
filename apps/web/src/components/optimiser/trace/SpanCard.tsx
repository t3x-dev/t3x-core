'use client';

import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { StepRecord } from './TraceTimeline';

interface SpanCardProps {
  step: StepRecord;
  className?: string;
}

// Collapsible JSON viewer
function JsonViewer({
  data,
  label,
  defaultOpen = false,
}: {
  data: unknown;
  label: string;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const jsonString = JSON.stringify(data, null, 2);
  const isLarge = jsonString.length > 500;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border bg-muted/30">
      <button
        type="button"
        className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">{label}</span>
          {!isOpen && (
            <span className="text-xs text-muted-foreground">
              {isLarge ? `${Math.round(jsonString.length / 1024)}KB` : `${jsonString.length} chars`}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleCopy}>
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      </button>
      {isOpen && (
        <div className="border-t p-3">
          <pre className="overflow-auto text-xs font-mono whitespace-pre-wrap break-all max-h-64">
            {jsonString}
          </pre>
        </div>
      )}
    </div>
  );
}

// LLM details section
function LLMDetails({ llm }: { llm: NonNullable<StepRecord['llm']> }) {
  return (
    <div className="space-y-3">
      {/* Model Info */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Model: </span>
          <span className="font-medium">{llm.model}</span>
        </div>
        {llm.provider && (
          <div>
            <span className="text-muted-foreground">Provider: </span>
            <span className="font-medium">{llm.provider}</span>
          </div>
        )}
        {llm.temperature !== undefined && (
          <div>
            <span className="text-muted-foreground">Temperature: </span>
            <span className="font-mono">{llm.temperature}</span>
          </div>
        )}
      </div>

      {/* Token Usage */}
      <div className="rounded-lg border p-3">
        <p className="mb-2 text-sm font-medium">Token Usage</p>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="text-center">
            <p className="text-muted-foreground">Prompt</p>
            <p className="font-mono font-medium">{llm.tokens.prompt.toLocaleString()}</p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground">Completion</p>
            <p className="font-mono font-medium">{llm.tokens.completion.toLocaleString()}</p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground">Total</p>
            <p className="font-mono font-medium">{llm.tokens.total.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      {llm.messages && llm.messages.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Messages</p>
          {llm.messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                'rounded-lg border p-3',
                msg.role === 'user' && 'bg-blue-500/5 border-blue-500/20',
                msg.role === 'assistant' && 'bg-green-500/5 border-green-500/20',
                msg.role === 'system' && 'bg-yellow-500/5 border-yellow-500/20'
              )}
            >
              <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                {msg.role}
              </div>
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Tool details section
function ToolDetails({ tool }: { tool: NonNullable<StepRecord['tool']> }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Tool: </span>
          <span className="font-medium">{tool.tool_name}</span>
        </div>
        {tool.was_expected !== undefined && (
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded border',
              tool.was_expected
                ? 'bg-green-500/10 text-green-600 border-green-500/30'
                : 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30'
            )}
          >
            {tool.was_expected ? 'Expected' : 'Unexpected'}
          </span>
        )}
      </div>

      <JsonViewer data={tool.tool_input} label="Input" defaultOpen />
      <JsonViewer data={tool.tool_output} label="Output" />
    </div>
  );
}

// Retrieval details section
function RetrievalDetails({ retrieval }: { retrieval: NonNullable<StepRecord['retrieval']> }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border p-3">
        <p className="mb-1 text-xs font-medium text-muted-foreground">Query</p>
        <p className="text-sm">{retrieval.query}</p>
      </div>

      {retrieval.top_k && (
        <div className="text-sm">
          <span className="text-muted-foreground">Top K: </span>
          <span className="font-mono">{retrieval.top_k}</span>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Documents ({retrieval.documents.length})</p>
        {retrieval.documents.map((doc, i) => (
          <div key={i} className="rounded-lg border p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Document {i + 1}</span>
              {doc.score !== undefined && (
                <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                  score: {doc.score.toFixed(3)}
                </span>
              )}
            </div>
            <p className="text-sm whitespace-pre-wrap line-clamp-4">{doc.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SpanCard({ step, className }: SpanCardProps) {
  return (
    <div className={cn('rounded-lg border bg-background p-4 space-y-4', className)}>
      {/* Error Message */}
      {step.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <p className="text-xs font-medium text-red-600 mb-1">Error</p>
          <p className="text-sm text-red-700">{step.error}</p>
        </div>
      )}

      {/* LLM Details */}
      {step.llm && <LLMDetails llm={step.llm} />}

      {/* Tool Details */}
      {step.tool && <ToolDetails tool={step.tool} />}

      {/* Retrieval Details */}
      {step.retrieval && <RetrievalDetails retrieval={step.retrieval} />}

      {/* Generic Input/Output for chain/workflow types */}
      {!step.llm && !step.tool && !step.retrieval && (
        <div className="space-y-3">
          {step.input !== undefined && <JsonViewer data={step.input} label="Input" />}
          {step.output !== undefined && <JsonViewer data={step.output} label="Output" />}
        </div>
      )}

      {/* Legacy tokens display */}
      {step.tokens && !step.llm && (
        <div className="flex gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Tokens In: </span>
            <span className="font-mono">{step.tokens.in}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Tokens Out: </span>
            <span className="font-mono">{step.tokens.out}</span>
          </div>
        </div>
      )}

      {/* Step metadata */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground border-t pt-3">
        <div>
          <span>Step ID: </span>
          <code className="font-mono bg-muted px-1 rounded">{step.step_id}</code>
        </div>
        <div>
          <span>Type: </span>
          <code className="font-mono bg-muted px-1 rounded">{step.type}</code>
        </div>
        <div>
          <span>Index: </span>
          <span className="font-mono">{step.step_index}</span>
        </div>
      </div>
    </div>
  );
}
