'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/utils/cn';
import { type FlatNode, lookupNode, toTitleCase } from './mergeViewHelpers';

export function SideOnlySection({
  title,
  icon,
  paths,
  flatNodes,
  included,
  onToggle,
  colorClass,
}: {
  title: string;
  icon: React.ReactNode;
  paths: string[];
  flatNodes: FlatNode[];
  included: Set<string>;
  onToggle: (path: string) => void;
  colorClass: string;
}) {
  const [expanded, setExpanded] = useState(paths.length <= 5);

  if (paths.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex items-center gap-1.5 text-sm font-medium cursor-pointer hover:opacity-80"
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {icon}
        <span>{title}</span>
        <Badge variant="secondary" className="ml-1 text-[10px]">
          {paths.length}
        </Badge>
      </button>

      {expanded && (
        <div className="space-y-1 pl-6">
          {paths.map((path) => {
            const node = lookupNode(flatNodes, path);
            return (
              <button
                type="button"
                key={path}
                onClick={() => onToggle(path)}
                className={cn(
                  'flex items-center gap-2 rounded border px-2 py-1.5 text-xs cursor-pointer transition-colors w-full text-left',
                  included.has(path)
                    ? `${colorClass} border-current/20`
                    : 'border-[var(--stroke-divider)] opacity-50'
                )}
              >
                <Checkbox checked={included.has(path)} tabIndex={-1} />
                <span className="font-mono text-[var(--text-secondary)]">{path}</span>
                {node && (
                  <>
                    <span className="text-[var(--text-tertiary)]">{toTitleCase(node.type)}</span>
                    <span className="ml-auto text-[var(--text-tertiary)]">
                      {Object.keys(node.slots).length} slot
                      {Object.keys(node.slots).length !== 1 ? 's' : ''}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
