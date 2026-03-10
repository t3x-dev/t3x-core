'use client';

import { Plus, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BusinessRuleConfig } from '@/lib/api';
import { cn } from '@/lib/utils';

interface BusinessRuleTemplatesProps {
  onAdd: (rule: BusinessRuleConfig) => void;
  onClose: () => void;
}

interface RuleTemplate {
  name: string;
  description: string;
  config: Omit<BusinessRuleConfig, 'id'>;
}

const GENERAL_TEMPLATES: RuleTemplate[] = [
  {
    name: 'Decision Requires Basis',
    description: 'Every decision frame must reference supporting evidence',
    config: {
      type: 'llm',
      prompt:
        'Verify that every decision or conclusion has a clearly stated basis or supporting evidence. Flag any unsupported assertions.',
      message: 'Decision lacks supporting evidence',
      severity: 'warning',
    },
  },
  {
    name: 'No Hallucination',
    description: 'Extracted knowledge must trace back to conversation',
    config: {
      type: 'llm',
      prompt:
        'Check that all extracted knowledge accurately reflects what was discussed in the conversation. Flag any information that appears fabricated or not grounded in the source material.',
      message: 'Potential hallucination detected',
      severity: 'error',
    },
  },
  {
    name: 'Numeric Precision',
    description: 'Numbers and statistics must match source exactly',
    config: {
      type: 'llm',
      prompt:
        'Verify that all numbers, percentages, dates, and statistics in the extracted knowledge exactly match the values mentioned in the conversation.',
      message: 'Numeric value may be inaccurate',
      severity: 'error',
    },
  },
  {
    name: 'Minimum Frame Count',
    description: 'Require at least 3 frames per extraction',
    config: {
      type: 'rule',
      rule: 'frames.length >= 3',
      message: 'Too few frames extracted — expected at least 3',
      severity: 'warning',
    },
  },
  {
    name: 'High Confidence',
    description: 'All frames must have confidence above 0.7',
    config: {
      type: 'rule',
      rule: 'frames.every(f => f.confidence > 0.7)',
      message: 'One or more frames have low confidence',
      severity: 'warning',
    },
  },
];

const INDUSTRY_TEMPLATES: RuleTemplate[] = [
  {
    name: 'Travel: Booking Accuracy',
    description: 'Dates, prices, and destination details must be exact',
    config: {
      type: 'llm',
      prompt:
        'For travel-related knowledge: verify that all booking dates, prices, destination names, flight numbers, and hotel details exactly match the conversation. Any discrepancy could cause real booking errors.',
      message: 'Travel detail may be inaccurate',
      severity: 'error',
    },
  },
  {
    name: 'Legal: No Unauthorized Advice',
    description: 'Prevent extraction of statements that could be legal advice',
    config: {
      type: 'llm',
      prompt:
        'Check that extracted knowledge does not contain statements that could be interpreted as legal advice, legal conclusions, or legal recommendations unless explicitly attributed to a qualified legal professional in the conversation.',
      message: 'May contain unauthorized legal advice',
      severity: 'error',
    },
  },
  {
    name: 'Medical: Safety Check',
    description: 'Flag any medical dosages or treatment recommendations',
    config: {
      type: 'llm',
      prompt:
        'Flag any extracted knowledge that includes specific medical dosages, drug names with quantities, or treatment protocols. These must be verified by a medical professional before being committed.',
      message: 'Contains medical information requiring verification',
      severity: 'error',
    },
  },
  {
    name: 'Product: Feature Accuracy',
    description: 'Product features and pricing must match source',
    config: {
      type: 'llm',
      prompt:
        'Verify that all product features, pricing tiers, availability dates, and technical specifications accurately reflect the conversation source. Incorrect product information can mislead customers.',
      message: 'Product detail may be inaccurate',
      severity: 'warning',
    },
  },
];

export function BusinessRuleTemplates({ onAdd, onClose }: BusinessRuleTemplatesProps) {
  const handleAdd = (template: RuleTemplate) => {
    onAdd({
      ...template.config,
      id: template.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/(^_|_$)/g, ''),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className="bg-background rounded-lg border shadow-lg w-[560px] max-w-[90vw] max-h-[80vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold">Rule Templates</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-6">
          {/* General */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              General
            </h4>
            <div className="space-y-2">
              {GENERAL_TEMPLATES.map((t) => (
                <TemplateCard key={t.name} template={t} onAdd={() => handleAdd(t)} />
              ))}
            </div>
          </div>

          {/* Industry */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Industry-Specific
            </h4>
            <div className="space-y-2">
              {INDUSTRY_TEMPLATES.map((t) => (
                <TemplateCard key={t.name} template={t} onAdd={() => handleAdd(t)} />
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t">
          <p className="text-xs text-muted-foreground">
            Templates are starting points — edit them after adding to match your needs.
          </p>
        </div>
      </div>
    </div>
  );
}

function TemplateCard({ template, onAdd }: { template: RuleTemplate; onAdd: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{template.name}</span>
          <span
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded font-medium',
              template.config.type === 'llm'
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
            )}
          >
            {template.config.type === 'llm' ? 'AI' : 'expr'}
          </span>
          <span
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded font-medium',
              template.config.severity === 'error'
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
            )}
          >
            {template.config.severity}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{template.description}</p>
      </div>
      <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={onAdd}>
        <Plus className="h-3 w-3 mr-1" />
        Add
      </Button>
    </div>
  );
}
