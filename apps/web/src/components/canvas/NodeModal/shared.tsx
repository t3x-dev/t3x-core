'use client';

import { Pin } from 'lucide-react';
import { PinButton } from '@/components/ui/PinButton';
import { PinDropdownSelector } from '@/components/ui/PinDropdownSelector';
import { usePinsStore } from '@/store/pinsStore';

/** Memory controls shared by the staging and conversation workflows. */
export function MemoryContextSidebar({
  projectId,
  conversationId,
  branch,
}: {
  projectId?: string;
  conversationId?: string;
  branch?: string;
}) {
  const pins = usePinsStore((state) => state.pins);

  const convCount = pins.filter((pin) => pin.type === 'conversation').length;
  const leafCount = pins.filter((pin) => pin.type === 'leaf').length;
  const totalCount = convCount + leafCount;

  if (!projectId) return null;

  return (
    <>
      <div className="h-px bg-border my-4" />
      <div className="mb-5">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Memory Context
        </h4>

        {branch ? (
          <PinDropdownSelector projectId={projectId} branch={branch} />
        ) : (
          <>
            <div className="flex items-center gap-2 text-[0.85rem] text-muted-foreground mb-[var(--space-item)]">
              <Pin size={14} className="text-muted-foreground/70 shrink-0" />
              <span>
                {totalCount === 0
                  ? 'No pins'
                  : `${convCount} conversation${convCount !== 1 ? 's' : ''}${leafCount > 0 ? `, ${leafCount} leaf${leafCount !== 1 ? 's' : ''}` : ''} pinned`}
              </span>
            </div>
            {conversationId && (
              <div className="flex items-center justify-between p-2 bg-background rounded border border-border mt-2">
                <span className="text-xs text-muted-foreground truncate mr-2">
                  conv#{conversationId.replace(/^conv_/, '').slice(0, 6)}
                </span>
                <PinButton
                  projectId={projectId}
                  type="conversation"
                  refId={conversationId}
                  className="h-7 w-7"
                />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
