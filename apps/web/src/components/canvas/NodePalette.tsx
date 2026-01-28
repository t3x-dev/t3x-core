'use client';

import { Leaf, MessageSquare } from 'lucide-react';
import type { DragEvent } from 'react';
import { cn } from '@/lib/utils';
import type { NodeKind } from '@/types/nodes';

interface PaletteItem {
  kind: NodeKind;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const paletteItems: PaletteItem[] = [
  {
    kind: 'unit',
    label: 'Unit',
    description: 'Conversation unit',
    icon: <MessageSquare className="h-4 w-4" />,
  },
  {
    kind: 'leaf',
    label: 'Leaf',
    description: 'Output generator',
    icon: <Leaf className="h-4 w-4" />,
  },
];

function PaletteNode({ item }: { item: PaletteItem }) {
  const onDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData('application/reactflow', item.kind);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-grab',
        'bg-background border border-border/50',
        'hover:border-primary/30 hover:bg-primary/5',
        'transition-all duration-200',
        'active:cursor-grabbing active:scale-95',
        'select-none'
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-md',
          'bg-primary/10 text-primary'
        )}
      >
        {item.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{item.label}</div>
        <div className="text-xs text-muted-foreground truncate">{item.description}</div>
      </div>
    </div>
  );
}

export function NodePalette() {
  return (
    <div
      className={cn(
        'absolute left-4 top-20 z-10 w-48',
        'flex flex-col gap-2 p-3',
        'bg-background/95 backdrop-blur-sm',
        'border border-border/50 rounded-xl shadow-lg'
      )}
    >
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
        Nodes
      </div>
      {paletteItems.map((item) => (
        <PaletteNode key={item.kind} item={item} />
      ))}
    </div>
  );
}
