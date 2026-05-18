'use client';

import {
  BookOpen,
  Brain,
  Check,
  CheckCircle,
  FileText,
  Loader2,
  MessageSquare,
  Pin,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { TurnBubble } from '@/components/source-context/TurnBubble';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConversationsList } from '@/hooks/conversations/useConversationsList';
import { usePinsCrud } from '@/hooks/pins/usePinsCrud';
import { useLeavesByProject } from '@/hooks/projects/useLeavesByProject';
import { useTurnsList } from '@/hooks/shared/useTurnsList';
import { usePinsStore } from '@/store/pinsStore';
import type { Conversation, Leaf, Turn } from '@/types/api';
import { cn } from '@/utils/cn';
import { glass } from '@/utils/theme';

// Selected item type for detail panel
type SelectedItem =
  | { type: 'conversation'; id: string; data: Conversation }
  | { type: 'leaf'; id: string; data: Leaf }
  | null;

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

  // Detail panel state
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  const [detailTurns, setDetailTurns] = useState<Turn[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Pin store
  const pins = usePinsStore((s) => s.pins);
  const isPinned = usePinsStore((s) => s.isPinned);
  const getPinByRef = usePinsStore((s) => s.getPinByRef);
  const { fetch: fetchPins, add: addPin, remove: removePin } = usePinsCrud();
  const { loadConversations } = useConversationsList();
  const { loadLeaves } = useLeavesByProject();
  const { loadTurns } = useTurnsList();

  // Fetch data when modal opens
  useEffect(() => {
    if (!open || !projectId) return;

    // Reset state when modal opens
    setSelectedItem(null);
    setDetailTurns([]);

    // Fetch pins for project
    fetchPins(projectId);

    // Fetch conversations
    setLoadingConversations(true);
    loadConversations(projectId, 100, 0)
      .then((result) => setConversations(result.conversations))
      .catch(() => setConversations([]))
      .finally(() => setLoadingConversations(false));

    // Fetch leaves
    setLoadingLeaves(true);
    loadLeaves(projectId)
      .then(setLeaves)
      .catch(() => setLeaves([]))
      .finally(() => setLoadingLeaves(false));
  }, [open, projectId, fetchPins, loadConversations, loadLeaves]);

  // Load conversation turns when a conversation is selected
  useEffect(() => {
    if (!selectedItem || selectedItem.type !== 'conversation') {
      setDetailTurns([]);
      return;
    }

    setLoadingDetail(true);
    loadTurns(projectId, selectedItem.id)
      .then((result) => setDetailTurns(result.turns))
      .catch(() => setDetailTurns([]))
      .finally(() => setLoadingDetail(false));
  }, [selectedItem, projectId, loadTurns]);

  // Count pinned items
  const pinnedConversations = useMemo(
    () => pins.filter((p) => p.type === 'conversation').length,
    [pins]
  );
  const pinnedLeaves = useMemo(() => pins.filter((p) => p.type === 'leaf').length, [pins]);

  // Handle pin toggle (called when clicking checkbox)
  const handleTogglePin = async (
    e: React.MouseEvent,
    type: 'conversation' | 'leaf',
    refId: string
  ) => {
    e.stopPropagation(); // Prevent row selection
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

  // Handle row click (select item to show detail)
  const handleSelectConversation = (conv: Conversation) => {
    setSelectedItem({ type: 'conversation', id: conv.conversation_id, data: conv });
  };

  const handleSelectLeaf = (leaf: Leaf) => {
    setSelectedItem({ type: 'leaf', id: leaf.id, data: leaf });
  };

  // Render detail panel content
  const renderDetailPanel = () => {
    if (!selectedItem) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-[var(--text-tertiary)]">
          <MessageSquare className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm">Select an item to preview</p>
        </div>
      );
    }

    if (loadingDetail) {
      return (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
        </div>
      );
    }

    // Conversation detail
    if (selectedItem.type === 'conversation') {
      const conv = selectedItem.data;
      return (
        <div className="flex flex-col h-full min-h-0">
          <div className="shrink-0 px-4 py-3 border-b border-[var(--stroke-divider)]">
            <h3 className="font-medium text-sm truncate text-[var(--text-primary)]">
              {conv.title || 'Untitled Conversation'}
            </h3>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
              {detailTurns.length} turns · {new Date(conv.created_at).toLocaleDateString()}
            </p>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-[var(--space-group)] space-y-3">
              {detailTurns.length === 0 ? (
                <p className="text-sm text-[var(--text-tertiary)] text-center py-4">
                  No turns in this conversation
                </p>
              ) : (
                detailTurns.map((turn) => (
                  <TurnBubble
                    key={turn.turn_hash}
                    turn={{
                      turn_hash: turn.turn_hash,
                      role: turn.role,
                      content: turn.content,
                      created_at: turn.created_at,
                    }}
                    showTargetRing={false}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      );
    }

    // Leaf detail
    if (selectedItem.type === 'leaf') {
      const leaf = selectedItem.data;
      return (
        <div className="flex flex-col h-full min-h-0">
          <div className="shrink-0 px-4 py-3 border-b border-[var(--stroke-divider)]">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm truncate text-[var(--text-primary)]">
                {leaf.title || `Leaf: ${leaf.id.slice(0, 12)}...`}
              </h3>
              <span className="px-1.5 py-0.5 text-xs bg-[var(--hover-bg)] rounded shrink-0">
                {leaf.type}
              </span>
            </div>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
              {leaf.constraints?.length || 0} constraints ·{' '}
              {new Date(leaf.created_at).toLocaleDateString()}
            </p>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-[var(--space-group)] space-y-[var(--space-group)]">
              {/* Constraints */}
              {leaf.constraints && leaf.constraints.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-medium text-[var(--text-tertiary)] mb-[var(--space-item)] uppercase tracking-wide">
                    Constraints
                  </h4>
                  <div className="space-y-[var(--space-item)]">
                    {leaf.constraints.map((c) => (
                      <div
                        key={c.id}
                        className={cn(
                          'p-2 rounded border text-sm',
                          c.type === 'require'
                            ? 'bg-[var(--status-success-muted)] border-[var(--status-success)]/20'
                            : 'bg-[var(--status-error-muted)] border-[var(--status-error)]/20'
                        )}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          {c.type === 'require' ? (
                            <Check className="h-3.5 w-3.5 text-[var(--status-success)]" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-[var(--status-error)]" />
                          )}
                          <span
                            className={cn(
                              'text-xs font-medium',
                              c.type === 'require'
                                ? 'text-[var(--status-success)]'
                                : 'text-[var(--status-error)]'
                            )}
                          >
                            {c.type === 'require' ? 'Require' : 'Exclude'}
                          </span>
                          <span className="text-xs text-[var(--text-tertiary)]">
                            ({c.match_mode})
                          </span>
                        </div>
                        <p className="text-sm">{c.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Output */}
              {leaf.output && (
                <div>
                  <h4 className="text-[10px] font-medium text-[var(--text-tertiary)] mb-[var(--space-item)] uppercase tracking-wide">
                    Output
                  </h4>
                  <div className="p-3 rounded border border-[var(--stroke-divider)] bg-[var(--surface-app)]">
                    <p className="text-sm whitespace-pre-wrap">{leaf.output}</p>
                  </div>
                </div>
              )}

              {/* Assertion Lessons (from runner evaluation) */}
              {(() => {
                const assertions = leaf.runner_assertions ?? leaf.assertions;
                if (!assertions || assertions.length === 0) return null;
                const pin = getPinByRef('leaf', leaf.id);
                const selectedIds = pin?.selected_assertion_ids;
                return (
                  <div>
                    <h4 className="text-[10px] font-medium text-[var(--text-tertiary)] mb-[var(--space-item)] uppercase tracking-wide">
                      Evaluation Lessons
                      {selectedIds && (
                        <span className="ml-1 text-[var(--status-warning)]">
                          ({selectedIds.length} pinned)
                        </span>
                      )}
                    </h4>
                    <div className="space-y-[var(--space-item)]">
                      {assertions.map((a) => {
                        const isSelected = selectedIds?.includes(a.id);
                        return (
                          <div
                            key={a.id}
                            className={cn(
                              'p-2 rounded border text-sm',
                              a.passed
                                ? 'bg-[var(--status-success-muted)] border-[var(--status-success)]/20'
                                : 'bg-[var(--status-error-muted)] border-[var(--status-error)]/20',
                              isSelected && 'ring-1 ring-[var(--status-warning)]/50'
                            )}
                          >
                            <div className="flex items-center gap-1.5 mb-1">
                              {a.passed ? (
                                <CheckCircle className="h-3.5 w-3.5 text-[var(--status-success)]" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5 text-[var(--status-error)]" />
                              )}
                              <span
                                className={cn(
                                  'text-xs font-medium',
                                  a.passed
                                    ? 'text-[var(--status-success)]'
                                    : 'text-[var(--status-error)]'
                                )}
                              >
                                {a.passed ? 'Passed' : 'Failed'}
                              </span>
                              {isSelected && (
                                <Pin className="h-3 w-3 text-[var(--status-warning)] fill-[var(--status-warning)]" />
                              )}
                            </div>
                            <p className="text-sm text-[var(--text-secondary)]">{a.details}</p>
                            {a.lesson && (
                              <div className="mt-1.5 flex items-start gap-1.5 rounded bg-[var(--status-warning-muted)] p-1.5 text-xs">
                                <BookOpen className="mt-0.5 h-3 w-3 shrink-0 text-[var(--status-warning)]" />
                                <span className="text-[var(--status-warning)]">
                                  {a.lesson}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* No content */}
              {(!leaf.constraints || leaf.constraints.length === 0) &&
                !leaf.output &&
                !(leaf.runner_assertions ?? leaf.assertions)?.length && (
                  <p className="text-sm text-[var(--text-tertiary)] text-center py-4">
                    No constraints or output yet
                  </p>
                )}
            </div>
          </ScrollArea>
        </div>
      );
    }

    return null;
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        className={cn(
          'w-[95vw] h-[90vh] max-w-none sm:max-w-none flex flex-col p-0 gap-0 rounded-2xl',
          glass.elevatedBase,
          glass.highlight
        )}
      >
        <DialogHeader className="shrink-0 px-6 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Memory Context
          </DialogTitle>
          <DialogDescription className="text-xs">
            Select conversations and leaves to include in AI memory.
          </DialogDescription>
        </DialogHeader>

        {/* Summary */}
        <div className="shrink-0 flex items-center gap-3 py-1.5 px-3 mx-6 bg-[var(--hover-bg)] rounded-lg text-xs">
          <div className="flex items-center gap-1">
            <Pin className="h-3 w-3 text-[var(--status-warning)] fill-[var(--status-warning)]" />
            <span className="font-medium text-[var(--text-primary)]">
              {pinnedConversations + pinnedLeaves}
            </span>
            <span className="text-[var(--text-tertiary)]">pinned</span>
          </div>
          <div className="h-3 w-px bg-[var(--stroke-divider)]" />
          <div className="flex items-center gap-1 text-[var(--text-tertiary)]">
            <MessageSquare className="h-3 w-3" />
            <span>{pinnedConversations} conversations</span>
          </div>
          <div className="flex items-center gap-1 text-[var(--text-tertiary)]">
            <FileText className="h-3 w-3" />
            <span>{pinnedLeaves} leaves</span>
          </div>
        </div>

        {/* Main content: Left-Right split */}
        <div className="flex flex-1 min-h-0 mt-2 border-t border-[var(--stroke-default)] overflow-hidden">
          {/* Left panel: List */}
          <div className="w-[320px] shrink-0 border-r border-[var(--stroke-default)] flex flex-col bg-[var(--surface-panel)]">
            <Tabs defaultValue="conversations" className="flex-1 min-h-0 flex flex-col">
              <TabsList className="w-full justify-start rounded-none border-b border-[var(--stroke-divider)] bg-transparent px-2 pt-2 h-auto">
                <TabsTrigger
                  value="conversations"
                  className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--accent-commit)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-none text-[var(--text-tertiary)] text-xs px-3 py-2"
                >
                  <MessageSquare className="h-4 w-4" />
                  Conversations
                  {pinnedConversations > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs border border-[var(--status-warning)]/40 text-[var(--status-warning)] bg-transparent rounded-full">
                      {pinnedConversations}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="leaves"
                  className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--accent-commit)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-none text-[var(--text-tertiary)] text-xs px-3 py-2"
                >
                  <FileText className="h-4 w-4" />
                  Leaves
                  {pinnedLeaves > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs border border-[var(--status-warning)]/40 text-[var(--status-warning)] bg-transparent rounded-full">
                      {pinnedLeaves}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Conversations Tab */}
              <TabsContent value="conversations" className="flex-1 overflow-auto mt-0 p-2">
                {loadingConversations ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-[var(--text-tertiary)]">
                    <MessageSquare className="h-8 w-8 mb-[var(--space-item)] opacity-50" />
                    <p className="text-sm">No conversations</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {conversations.map((conv) => {
                      const pinned = isPinned('conversation', conv.conversation_id);
                      const isToggling = togglingId === conv.conversation_id;
                      const isSelected =
                        selectedItem?.type === 'conversation' &&
                        selectedItem.id === conv.conversation_id;
                      return (
                        <div
                          key={conv.conversation_id}
                          className={cn(
                            'flex items-center gap-2 p-2 rounded-lg border border-transparent transition-colors cursor-pointer hover:bg-[var(--hover-bg)]',
                            pinned && 'border-l-2 border-l-[var(--accent-branch)]',
                            isSelected && 'ring-2 ring-[var(--accent-commit)]/50'
                          )}
                          onClick={() => handleSelectConversation(conv)}
                        >
                          <div
                            onClick={(e) =>
                              handleTogglePin(e, 'conversation', conv.conversation_id)
                            }
                            className="shrink-0"
                          >
                            <Checkbox
                              checked={pinned}
                              disabled={isToggling}
                              className={cn(
                                pinned &&
                                  'border-[var(--status-warning)] bg-[var(--status-warning)] text-[var(--on-status)]'
                              )}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-sm truncate">
                                {conv.title || 'Untitled'}
                              </span>
                              {pinned && (
                                <Pin className="h-3 w-3 text-[var(--status-warning)] fill-[var(--status-warning)] shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                              <span>{conv.turns_count || 0} turns</span>
                              <span>·</span>
                              <span>{new Date(conv.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                          {isToggling && (
                            <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)] shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* Leaves Tab */}
              <TabsContent value="leaves" className="flex-1 overflow-auto mt-0 p-2">
                {loadingLeaves ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
                  </div>
                ) : leaves.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-[var(--text-tertiary)]">
                    <FileText className="h-8 w-8 mb-[var(--space-item)] opacity-50" />
                    <p className="text-sm">No leaves</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {leaves.map((leaf) => {
                      const pinned = isPinned('leaf', leaf.id);
                      const isToggling = togglingId === leaf.id;
                      const isSelected =
                        selectedItem?.type === 'leaf' && selectedItem.id === leaf.id;
                      return (
                        <div
                          key={leaf.id}
                          className={cn(
                            'flex items-center gap-2 p-2 rounded-lg border border-transparent transition-colors cursor-pointer hover:bg-[var(--hover-bg)]',
                            pinned && 'border-l-2 border-l-[var(--accent-branch)]',
                            isSelected && 'ring-2 ring-[var(--accent-commit)]/50'
                          )}
                          onClick={() => handleSelectLeaf(leaf)}
                        >
                          <div
                            onClick={(e) => handleTogglePin(e, 'leaf', leaf.id)}
                            className="shrink-0"
                          >
                            <Checkbox
                              checked={pinned}
                              disabled={isToggling}
                              className={cn(
                                pinned &&
                                  'border-[var(--status-warning)] bg-[var(--status-warning)] text-[var(--on-status)]'
                              )}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-sm truncate">
                                {leaf.title || `Leaf: ${leaf.id.slice(0, 8)}...`}
                              </span>
                              {pinned && (
                                <Pin className="h-3 w-3 text-[var(--status-warning)] fill-[var(--status-warning)] shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                              <span className="px-1 py-0.5 bg-[var(--hover-bg)] rounded text-[10px]">
                                {leaf.type}
                              </span>
                              <span>·</span>
                              <span>{new Date(leaf.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                          {isToggling && (
                            <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)] shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Right panel: Detail */}
          <div
            className={cn('flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden', glass.reading)}
          >
            {renderDetailPanel()}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex justify-end px-6 py-3 border-t border-[var(--stroke-divider)]">
          <Button variant="outline" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
