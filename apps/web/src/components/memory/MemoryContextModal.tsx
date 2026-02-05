'use client';

import { Brain, FileText, Loader2, MessageSquare, Pin, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Conversation, Leaf } from '@/lib/api';
import { listConversations, listLeavesByProject } from '@/lib/api';
import { cn } from '@/lib/utils';
import { usePinsStore } from '@/store/pinsStore';

interface MemoryContextModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

export function MemoryContextModal({ open, onClose, projectId }: MemoryContextModalProps) {
  // Local state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [leaves, setLeaves] = useState<Leaf[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingLeaves, setLoadingLeaves] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Pin store
  const { pins, isPinned, addPin, removePin, getPinByRef, fetchPins } = usePinsStore();

  // Fetch data when modal opens
  useEffect(() => {
    if (!open || !projectId) return;

    // Fetch pins for project
    fetchPins(projectId);

    // Fetch conversations
    setLoadingConversations(true);
    listConversations(projectId, 100, 0)
      .then((result) => setConversations(result.conversations))
      .catch(() => setConversations([]))
      .finally(() => setLoadingConversations(false));

    // Fetch leaves
    setLoadingLeaves(true);
    listLeavesByProject(projectId)
      .then(setLeaves)
      .catch(() => setLeaves([]))
      .finally(() => setLoadingLeaves(false));
  }, [open, projectId, fetchPins]);

  // Count pinned items
  const pinnedConversations = useMemo(
    () => pins.filter((p) => p.type === 'conversation').length,
    [pins]
  );
  const pinnedLeaves = useMemo(() => pins.filter((p) => p.type === 'leaf').length, [pins]);

  // Handle pin toggle
  const handleTogglePin = async (type: 'conversation' | 'leaf', refId: string) => {
    setTogglingId(refId);
    try {
      const pinned = isPinned(type, refId);
      if (pinned) {
        const pin = getPinByRef(type, refId);
        if (pin) {
          await removePin(pin.id);
        }
      } else {
        await addPin(projectId, type, refId);
      }
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Memory Context
          </DialogTitle>
          <DialogDescription>
            Select conversations and leaves to include in AI memory. Pinned items will be used as
            context for generating outputs.
          </DialogDescription>
        </DialogHeader>

        {/* Summary */}
        <div className="flex items-center gap-4 py-2 px-3 bg-muted/50 rounded-lg text-sm">
          <div className="flex items-center gap-1.5">
            <Pin className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
            <span className="font-medium">{pinnedConversations + pinnedLeaves}</span>
            <span className="text-muted-foreground">pinned</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>{pinnedConversations} conversations</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            <span>{pinnedLeaves} leaves</span>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="conversations" className="flex-1 min-h-0 flex flex-col">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="conversations" className="gap-1.5">
              <MessageSquare className="h-4 w-4" />
              Conversations
              {pinnedConversations > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded">
                  {pinnedConversations}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="leaves" className="gap-1.5">
              <FileText className="h-4 w-4" />
              Leaves
              {pinnedLeaves > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded">
                  {pinnedLeaves}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Conversations Tab */}
          <TabsContent value="conversations" className="flex-1 overflow-auto mt-4">
            {loadingConversations ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
                <p>No conversations in this project</p>
              </div>
            ) : (
              <div className="space-y-1">
                {conversations.map((conv) => {
                  const pinned = isPinned('conversation', conv.conversation_id);
                  const isToggling = togglingId === conv.conversation_id;
                  return (
                    <div
                      key={conv.conversation_id}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer hover:bg-muted/50',
                        pinned &&
                          'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                      )}
                      onClick={() => handleTogglePin('conversation', conv.conversation_id)}
                    >
                      <Checkbox
                        checked={pinned}
                        disabled={isToggling}
                        className={cn(pinned && 'border-amber-500 bg-amber-500 text-white')}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {conv.title || 'Untitled Conversation'}
                          </span>
                          {pinned && (
                            <Pin className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{conv.turns_count || 0} turns</span>
                          <span>·</span>
                          <span>{new Date(conv.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      {isToggling && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Leaves Tab */}
          <TabsContent value="leaves" className="flex-1 overflow-auto mt-4">
            {loadingLeaves ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : leaves.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <FileText className="h-8 w-8 mb-2 opacity-50" />
                <p>No leaves in this project</p>
              </div>
            ) : (
              <div className="space-y-1">
                {leaves.map((leaf) => {
                  const pinned = isPinned('leaf', leaf.id);
                  const isToggling = togglingId === leaf.id;
                  return (
                    <div
                      key={leaf.id}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer hover:bg-muted/50',
                        pinned &&
                          'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                      )}
                      onClick={() => handleTogglePin('leaf', leaf.id)}
                    >
                      <Checkbox
                        checked={pinned}
                        disabled={isToggling}
                        className={cn(pinned && 'border-amber-500 bg-amber-500 text-white')}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {leaf.title || `Leaf: ${leaf.id.slice(0, 12)}...`}
                          </span>
                          <span className="px-1.5 py-0.5 text-xs bg-muted rounded">
                            {leaf.type}
                          </span>
                          {pinned && (
                            <Pin className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{leaf.constraints?.length || 0} constraints</span>
                          <span>·</span>
                          <span>{new Date(leaf.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      {isToggling && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
