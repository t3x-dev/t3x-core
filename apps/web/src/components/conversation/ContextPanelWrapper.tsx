'use client';

import { useEffect, useState } from 'react';
import { usePinsStore } from '@/store/pinsStore';
import { ContextPanel } from './ContextPanel';
import { getConversationContext, updateConversationContext } from '@/lib/api';
import { toast } from '@/components/Toast';

interface ContextPanelWrapperProps {
  projectId: string;
  conversationId: string;
}

export function ContextPanelWrapper({ projectId, conversationId }: ContextPanelWrapperProps) {
  const { fetchPins, loading: pinsLoading } = usePinsStore();
  const [contextConfig, setContextConfig] = useState<{
    selected_pin_ids: string[] | null;
  } | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  // Fetch pins on mount
  useEffect(() => {
    fetchPins(projectId);
  }, [projectId, fetchPins]);

  // Fetch current context config
  useEffect(() => {
    async function loadContext() {
      try {
        setContextLoading(true);
        const context = await getConversationContext(conversationId);
        setContextConfig(context);
      } catch (err) {
        // Default to null (use all pins) if fetch fails
        setContextConfig(null);
      } finally {
        setContextLoading(false);
      }
    }
    loadContext();
  }, [conversationId]);

  // Handle context changes
  const handleContextChange = async (selectedPinIds: string[] | null) => {
    setIsUpdating(true);
    try {
      const updatedContext = await updateConversationContext(conversationId, selectedPinIds);
      setContextConfig({ selected_pin_ids: updatedContext.selected_pin_ids });
      toast.success('Context updated');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update context';
      toast.error(message);
    } finally {
      setIsUpdating(false);
    }
  };

  // Show loading state
  if (pinsLoading || contextLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Loading context...
      </div>
    );
  }

  return (
    <div className="relative">
      {isUpdating && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
          <span className="text-xs text-muted-foreground">Saving...</span>
        </div>
      )}
      <ContextPanel
        conversationId={conversationId}
        projectId={projectId}
        contextConfig={contextConfig}
        onContextChange={handleContextChange}
      />
    </div>
  );
}
