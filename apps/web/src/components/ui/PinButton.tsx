'use client';

import type { PinType } from '@t3x-dev/core';
import { Pin, PinOff } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePinsCrud } from '@/hooks/pins/usePinsCrud';
import { cn } from '@/utils/cn';
import { usePinsStore } from '@/store/pinsStore';

interface PinButtonProps {
  projectId: string;
  type: PinType;
  refId: string;
  className?: string;
}

export function PinButton({ projectId, type, refId, className }: PinButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const isPinned = usePinsStore((s) => s.isPinned);
  const getPinByRef = usePinsStore((s) => s.getPinByRef);
  const { add: addPin, remove: removePin } = usePinsCrud();

  const pinned = isPinned(type, refId);
  const pin = getPinByRef(type, refId);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      if (pinned && pin) {
        await removePin(pin.id);
      } else {
        await addPin(projectId, type, refId);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-8 w-8',
            pinned && 'text-[var(--status-warning)] hover:text-amber-600',
            className
          )}
          onClick={handleClick}
          disabled={isLoading}
        >
          {pinned ? <Pin className="h-4 w-4 fill-current" /> : <PinOff className="h-4 w-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{pinned ? 'Unpin from sources' : 'Pin as source'}</TooltipContent>
    </Tooltip>
  );
}
