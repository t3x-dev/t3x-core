'use client';

import { Panel, type PanelProps, useReactFlow, useStore, useViewport } from '@xyflow/react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/utils/cn';

export function ZoomSlider({
  className,
  compact = false,
  orientation = 'horizontal',
  ...props
}: Omit<PanelProps, 'children'> & {
  compact?: boolean;
  orientation?: 'horizontal' | 'vertical';
}) {
  const { zoom } = useViewport();
  const { zoomTo, zoomIn, zoomOut, fitView } = useReactFlow();
  const minZoom = useStore((state) => state.minZoom);
  const maxZoom = useStore((state) => state.maxZoom);

  return (
    <Panel
      className={cn(
        'bg-background text-foreground flex gap-1 rounded-md p-1 elevation-3 border border-border/50',
        orientation === 'horizontal' ? 'flex-row' : 'flex-col',
        className
      )}
      {...props}
    >
      <div
        className={cn('flex gap-1', orientation === 'horizontal' ? 'flex-row' : 'flex-col-reverse')}
      >
        <Button variant="ghost" size="icon" onClick={() => zoomOut({ duration: 300 })}>
          <Minus className="h-4 w-4" />
        </Button>
        {!compact && (
          <Slider
            className={cn(orientation === 'horizontal' ? 'w-[140px]' : 'h-[140px]')}
            orientation={orientation}
            value={[zoom]}
            min={minZoom}
            max={maxZoom}
            step={0.01}
            onValueChange={(values) => zoomTo(values[0])}
          />
        )}
        <Button variant="ghost" size="icon" onClick={() => zoomIn({ duration: 300 })}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {!compact && (
        <Button
          className={cn(
            'tabular-nums',
            orientation === 'horizontal' ? 'w-[60px] min-w-10' : 'h-[40px] w-[40px]'
          )}
          variant="ghost"
          onClick={() => zoomTo(1, { duration: 300 })}
        >
          {(100 * zoom).toFixed(0)}%
        </Button>
      )}
      <Button variant="ghost" size="icon" onClick={() => fitView({ duration: 300 })}>
        <Maximize className="h-4 w-4" />
      </Button>
    </Panel>
  );
}
