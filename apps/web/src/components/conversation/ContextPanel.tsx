'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePinsStore } from '@/store/pinsStore';
import { EditContextDialog } from './EditContextDialog';

interface ContextPanelProps {
  conversationId: string;
  projectId: string;
  contextConfig: { selected_pin_ids: string[] | null } | null;
  onContextChange: (pinIds: string[] | null) => void;
}

export function ContextPanel({
  conversationId,
  projectId,
  contextConfig,
  onContextChange,
}: ContextPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { pins } = usePinsStore();

  // Determine active pins
  const activePins = contextConfig?.selected_pin_ids === null
    ? pins // all pins
    : pins.filter(p => contextConfig?.selected_pin_ids?.includes(p.id));

  const convPins = activePins.filter(p => p.type === 'conversation');
  const leafPins = activePins.filter(p => p.type === 'leaf');

  return (
    <div className="border-r bg-muted/30 w-64 flex flex-col">
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span className="font-medium text-sm">Context</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            setIsDialogOpen(true);
          }}
        >
          <Settings2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-3 space-y-3 text-sm">
          {/* Status */}
          <div className="text-muted-foreground">
            {contextConfig?.selected_pin_ids === null
              ? 'Using all pins'
              : `Using ${activePins.length} pins`}
          </div>

          {/* Pinned conversations */}
          {convPins.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Conversations
              </div>
              {convPins.map(pin => (
                <div key={pin.id} className="flex items-center gap-1">
                  <span className="text-amber-500">📌</span>
                  <span className="truncate">{pin.ref_id}</span>
                </div>
              ))}
            </div>
          )}

          {/* Pinned leaves */}
          {leafPins.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Leaves
              </div>
              {leafPins.map(pin => (
                <div key={pin.id} className="flex items-center gap-1">
                  <span className="text-amber-500">📌</span>
                  <span className="truncate">{pin.ref_id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit Dialog */}
      <EditContextDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        projectId={projectId}
        conversationId={conversationId}
        currentSelection={contextConfig?.selected_pin_ids ?? null}
        onSave={onContextChange}
      />
    </div>
  );
}
