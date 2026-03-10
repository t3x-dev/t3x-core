'use client';

import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GateStatus {
  name: string;
  status: 'pending' | 'checking' | 'passed' | 'failed' | 'warning';
  detail?: string;
  duration?: number;
}

interface GateCheckProgressProps {
  gates: GateStatus[];
}

export function GateCheckProgress({ gates }: GateCheckProgressProps) {
  return (
    <div className="space-y-2 p-3">
      {gates.map((gate) => (
        <div key={gate.name} className="flex items-center gap-2 text-sm">
          {gate.status === 'pending' && <Circle className="h-4 w-4 text-muted-foreground" />}
          {gate.status === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
          {gate.status === 'passed' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          {gate.status === 'failed' && <XCircle className="h-4 w-4 text-red-500" />}
          {gate.status === 'warning' && <CheckCircle2 className="h-4 w-4 text-amber-500" />}
          <span className={cn(gate.status === 'pending' && 'text-muted-foreground')}>
            {gate.name}
          </span>
          {gate.detail && (
            <span className="ml-auto text-xs text-muted-foreground">{gate.detail}</span>
          )}
          {gate.duration != null && (
            <span className="text-xs text-muted-foreground">{gate.duration}ms</span>
          )}
        </div>
      ))}
    </div>
  );
}
