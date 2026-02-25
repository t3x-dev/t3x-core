'use client';

import type { Node } from '@xyflow/react';
import {
  AlertCircle,
  Check,
  Clock,
  GitCommit,
  Link2,
  Loader2,
  MessageSquarePlus,
  Send,
  Settings,
  X,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useTerminology } from '@/hooks/useTerminology';
import * as api from '@/lib/api';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import type {
  CanvasNodeData,
  ConversationConstraints,
  DraftConstraintOverrides,
} from '@/types/nodes';
import type { NodeQuickAction } from './NodeModal';
import { MemoryContextSidebar } from './shared';

// Chat page size for pagination
const CHAT_PAGE_SIZE = 100;

export interface ConversationViewProps {
  node: Node<CanvasNodeData>;
  onClose: () => void;
  onUpdate: (patch: Partial<CanvasNodeData>) => void;
  projectId: string;
  isStagingUnit: boolean;
  quickActions: NodeQuickAction[] | undefined;
  onSaveConstraints: ((constraints: ConversationConstraints) => void) | undefined;
  effectiveConstraints:
    | {
        clauses: ConversationConstraints['clauses'];
        must_have: string[];
        mustnt_have: string[];
      }
    | undefined;
  onUpdateConstraintOverrides: ((overrides: Partial<DraftConstraintOverrides>) => void) | undefined;
  isConversationLocked: boolean | undefined;
  onShowCommitConfig: () => void;
}

export function ConversationView({
  node,
  onClose,
  onUpdate,
  projectId,
  isStagingUnit,
  quickActions,
  onShowCommitConfig,
}: ConversationViewProps) {
  const { t } = useTerminology();
  const data = node.data;

  // Get projectId from route params for sidebar links
  const params = useParams();
  const routeProjectId = params?.projectId as string | undefined;

  // Derive the addCommitAction from quickActions
  const addCommitAction = useMemo(
    () => quickActions?.find((a) => a.key === 'add-commit'),
    [quickActions]
  );

  // ========== Layout state ==========
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [showSettings, setShowSettings] = useState(false);

  // ========== Chat state ==========
  const [chatMessages, setChatMessages] = useState<
    {
      id: string;
      role: 'user' | 'assistant';
      content: string;
      rings?: api.RingsData | null;
    }[]
  >([]);
  const [chatInput, setChatInput] = useState('');
  const [chatOffset, setChatOffset] = useState(0);
  const [chatHasMore, setChatHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);

  // ========== Refs ==========
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const conversationIdRef = useRef(data?.conversationId);
  const nodeKindRef = useRef(data?.kind);
  const chatMessagesRef = useRef(chatMessages);
  const prevConversationIdRef = useRef<string | undefined>(undefined);
  const loadMoreAbortRef = useRef<AbortController | null>(null);

  // ========== Sync refs ==========
  useEffect(() => {
    conversationIdRef.current = data?.conversationId;
    nodeKindRef.current = data?.kind;
  }, [data?.conversationId, data?.kind]);

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  // ========== Scroll to bottom when new messages added ==========
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ========== Load chat history from backend ==========
  useEffect(() => {
    const abortController = new AbortController();
    const currentConversationId = data?.conversationId;
    const prevConversationId = prevConversationIdRef.current;
    prevConversationIdRef.current = currentConversationId;

    const loadChatHistory = async () => {
      if (!data || data.kind !== 'unit' || !projectId || !currentConversationId) return;

      // If conversationId just changed from undefined to a value and we already have messages,
      // this means we just created the conversation during an active chat session.
      // Don't reload - the messages are already in state.
      if (prevConversationId === undefined && chatMessagesRef.current.length > 0) {
        return;
      }

      // Cancel any pending loadMore request when switching conversations
      loadMoreAbortRef.current?.abort();
      loadMoreAbortRef.current = null;

      // Clear old messages and reset pagination state
      setChatMessages([]);
      setChatOffset(0);
      setChatHasMore(false);
      setIsChatLoading(true);
      try {
        // Fetch newest CHAT_PAGE_SIZE messages first (order=desc), then reverse for display
        const response = await api.listTurns(projectId, currentConversationId, CHAT_PAGE_SIZE, 0, {
          signal: abortController.signal,
          order: 'desc',
        });

        // Check if conversation changed during request (race condition fix)
        if (abortController.signal.aborted || data?.conversationId !== currentConversationId) {
          return;
        }

        // Reverse the array since we fetched newest first (order=desc)
        // but need to display oldest first in the chat UI
        const messages = response.turns
          .filter((turn) => turn.role === 'user' || turn.role === 'assistant')
          .map((turn) => ({
            id: turn.turn_hash,
            role: turn.role as 'user' | 'assistant',
            content: turn.content,
            rings: api.parseRingsData((turn as api.TurnDetail).rings),
          }))
          .reverse();
        setChatMessages(messages);

        // Check if there are more messages to load
        setChatHasMore(response.turns.length >= CHAT_PAGE_SIZE);
        setChatOffset(response.turns.length);
      } catch (err) {
        const isAbortError =
          abortController.signal.aborted || (err instanceof api.ApiError && err.code === 'ABORTED');
        if (!isAbortError) {
          // Silently ignore non-abort errors
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsChatLoading(false);
        }
      }
    };

    loadChatHistory();

    return () => {
      abortController.abort();
      loadMoreAbortRef.current?.abort();
    };
  }, [data?.kind, data?.conversationId, projectId]);

  // ========== Load more (older) messages ==========
  const loadMoreMessages = useCallback(async () => {
    if (!projectId || !data?.conversationId || isLoadingMore || !chatHasMore) return;

    // Cancel any pending load more request
    loadMoreAbortRef.current?.abort();
    const abortController = new AbortController();
    loadMoreAbortRef.current = abortController;

    const currentConversationId = data?.conversationId;
    const container = messagesContainerRef.current;

    // Capture scroll position before loading
    const scrollHeightBefore = container?.scrollHeight ?? 0;

    setIsLoadingMore(true);
    try {
      const response = await api.listTurns(
        projectId,
        currentConversationId,
        CHAT_PAGE_SIZE,
        chatOffset,
        {
          order: 'desc',
          signal: abortController.signal,
        }
      );

      // Check for race condition: conversation changed or request aborted
      if (abortController.signal.aborted || data?.conversationId !== currentConversationId) {
        return;
      }

      if (response.turns.length === 0) {
        setChatHasMore(false);
        return;
      }

      // Older messages (fetched in desc order, need to reverse)
      const olderMessages = response.turns
        .filter((turn) => turn.role === 'user' || turn.role === 'assistant')
        .map((turn) => ({
          id: turn.turn_hash,
          role: turn.role as 'user' | 'assistant',
          content: turn.content,
          rings: api.parseRingsData((turn as api.TurnDetail).rings),
        }))
        .reverse();

      // Prepend older messages to the beginning
      setChatMessages((prev) => [...olderMessages, ...prev]);
      setChatOffset((prev) => prev + response.turns.length);
      setChatHasMore(response.turns.length >= CHAT_PAGE_SIZE);

      // Preserve scroll position after prepending
      requestAnimationFrame(() => {
        if (container && data?.conversationId === currentConversationId) {
          const scrollHeightAfter = container.scrollHeight;
          const heightDiff = scrollHeightAfter - scrollHeightBefore;
          container.scrollTop = container.scrollTop + heightDiff;
        }
      });
    } catch (err) {
      const isAbortError =
        abortController.signal.aborted || (err instanceof api.ApiError && err.code === 'ABORTED');
      if (!isAbortError) {
        // Silently ignore non-abort errors
      }
    } finally {
      if (!abortController.signal.aborted) {
        setIsLoadingMore(false);
      }
    }
  }, [projectId, data?.conversationId, chatOffset, chatHasMore, isLoadingMore]);

  // ========== Handle scroll to detect when user reaches top ==========
  const handleChatScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.target as HTMLDivElement;
      // Load more when scrolled near the top (within 50px)
      if (target.scrollTop < 50 && chatHasMore && !isLoadingMore && !isChatLoading) {
        loadMoreMessages();
      }
    },
    [chatHasMore, isLoadingMore, isChatLoading, loadMoreMessages]
  );

  // ========== Send message ==========
  const handleSendMessage = useCallback(async () => {
    if (!chatInput.trim() || isChatStreaming || isChatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatError(null);

    // Add user message to chat
    const newUserMessage = {
      id: `msg-${Date.now()}`,
      role: 'user' as const,
      content: userMessage,
    };
    setChatMessages((prev) => [...prev, newUserMessage]);

    setIsChatStreaming(true);
    setStreamingContent('');

    try {
      // Ensure conversation exists before fetching memory (create if needed)
      let convId = conversationIdRef.current;
      if (!convId && projectId && nodeKindRef.current === 'unit') {
        const newConv = await api.createConversation(
          projectId,
          data?.title || 'Untitled Conversation'
        );
        convId = newConv.conversation_id;
        onUpdate({
          conversationId: convId,
          sourceConversationId: convId,
        });
        conversationIdRef.current = convId;
        if (node?.id && node.id !== convId) {
          useCanvasStore.getState().updateNodeId(node.id, convId);
        }
      }

      // Fetch pin-based memory context
      let memoryContext = '';
      if (convId) {
        try {
          const ctx = await api.getConversationMemory(convId);
          if (ctx.text) {
            memoryContext = ctx.text;
          }
        } catch {
          // Memory fetch failed - proceed without context
        }
      }

      // Build messages array from chat history (use ref to get latest)
      const currentMessages = chatMessagesRef.current;
      const messages: api.ChatMessage[] = [
        // Inject pin memory as system message (if available)
        ...(memoryContext ? [{ role: 'system' as const, content: memoryContext }] : []),
        ...currentMessages.map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        { role: 'user' as const, content: userMessage },
      ];

      // Use streaming chat
      let fullResponse = '';
      let addedFinalMessage = false;

      for await (const event of api.chatStream({ messages })) {
        if (event.type === 'token' && event.content) {
          fullResponse += event.content;
          setStreamingContent(fullResponse);
        } else if (event.type === 'done') {
          // Update fullResponse with done event content if available
          if (event.content) {
            fullResponse = event.content;
          }
          // Add assistant message to chat (only once)
          if (!addedFinalMessage) {
            setChatMessages((prev) => [
              ...prev,
              {
                id: `msg-${Date.now()}`,
                role: 'assistant' as const,
                content: fullResponse,
              },
            ]);
            setStreamingContent('');
            addedFinalMessage = true;
          }
        } else if (event.type === 'error') {
          setChatError(event.message || 'Unknown error');
        }
      }

      // If we didn't get a done event but have content, add it
      if (fullResponse && !addedFinalMessage) {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}`,
            role: 'assistant' as const,
            content: fullResponse,
          },
        ]);
        setStreamingContent('');
      }

      // Save turns to the conversation
      const currentConversationId = conversationIdRef.current;
      const currentKind = nodeKindRef.current;
      if (projectId && currentKind === 'unit' && currentConversationId) {
        try {
          await api.createTurn(projectId, currentConversationId, 'user', userMessage);
          if (fullResponse) {
            try {
              await api.createTurn(projectId, currentConversationId, 'assistant', fullResponse);
            } catch (assistantErr) {
              // Assistant turn save failed - warn user that history may be incomplete
              console.warn('Failed to save assistant turn:', assistantErr);
              setChatError('Warning: Assistant response may not be saved to history');
            }
          }
        } catch (userErr) {
          // User turn save failed
          console.warn('Failed to save user turn:', userErr);
          setChatError('Warning: Message may not be saved to history');
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setChatError(error.message);
    } finally {
      setIsChatStreaming(false);
      setStreamingContent('');
    }
  }, [chatInput, isChatStreaming, isChatLoading, projectId, data?.title, onUpdate, node?.id]);

  // ========== Chat key handler ==========
  const handleChatKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ========== Divider drag handler ==========
  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = moveEvent.clientX - containerRect.left;
      // Clamp between 200 and 500px
      setSidebarWidth(Math.max(200, Math.min(500, newWidth)));
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // ========== Render ==========
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[8px]"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          'flex flex-col w-[95vw] max-w-[1400px] h-[85vh] rounded-2xl overflow-hidden',
          glass.cardBase,
          glass.highlight
        )}
      >
        {/* Top Bar */}
        <header className="flex items-center justify-between h-14 px-5 border-b border-[var(--stroke-divider)] shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-[0.95rem] font-semibold text-[var(--text-primary)]">
              {isStagingUnit ? 'Unit (Staging)' : 'Unit'}: {data.title || 'Untitled'}
            </h2>
            <span className="text-xs text-[var(--text-tertiary)] font-mono">{data.entryId}</span>
            {isStagingUnit && (
              <Badge
                variant="outline"
                className="text-[0.65rem] text-[var(--color-text-muted)] uppercase tracking-wider border-dashed border-slate-400/40 dark:border-slate-500/40 bg-slate-500/15"
              >
                staging
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowSettings(!showSettings)}
              title="Edit Meta"
              className="h-9 w-9"
            >
              <Settings size={18} />
            </Button>
            {/* For staging units: show Commit button to enter commit config view */}
            {isStagingUnit && (
              <Button
                onClick={onShowCommitConfig}
                title={t('configure_and_commit')}
                className="gap-1.5"
              >
                <Check size={16} />
                <span>{t('commitAction')}</span>
              </Button>
            )}
            {/* For committed units: show Create Unit button */}
            {addCommitAction && !isStagingUnit && (
              <Button
                onClick={() => {
                  addCommitAction.onClick();
                  onClose();
                }}
                disabled={addCommitAction.disabled}
                title="Create a new unit from this one"
                className="gap-1.5"
              >
                <GitCommit size={16} />
                <span>Create Unit</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close"
              className="h-9 w-9 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            >
              <X size={20} />
            </Button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden min-h-0" ref={containerRef}>
          {/* Left Sidebar - Metadata */}
          <aside
            className={cn(
              'min-w-[200px] p-5 overflow-y-auto shrink-0 bg-[var(--surface-app)]',
              showSettings ? 'block' : 'hidden md:block'
            )}
            style={{ width: sidebarWidth }}
          >
            <div className="mb-5">
              <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-3">
                Metadata
              </h4>
              <div className="mb-[var(--space-group)]">
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                  Title
                </label>
                <Input
                  type="text"
                  value={data.title}
                  onChange={(e) => onUpdate({ title: e.target.value })}
                />
              </div>
              <div className="mb-[var(--space-group)]">
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                  Tags
                </label>
                <Input
                  type="text"
                  value={data.tags.join(', ')}
                  onChange={(e) =>
                    onUpdate({
                      tags: e.target.value
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="tag1, tag2, ..."
                />
              </div>
            </div>

            <div className="h-px bg-[var(--stroke-divider)] my-4" />

            <div className="mb-5">
              <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-3">
                Info
              </h4>
              <div className="flex items-center gap-2 text-[0.85rem] text-[var(--text-secondary)] mb-[var(--space-item)]">
                <Clock size={14} className="text-[var(--text-tertiary)] shrink-0" />
                <span>Created: {data.timestamp}</span>
              </div>
              <div className="flex items-center gap-2 text-[0.85rem] text-[var(--text-secondary)] mb-[var(--space-item)]">
                <Link2 size={14} className="text-[var(--text-tertiary)] shrink-0" />
                <span>Upstream: {data.baselineSummary ? 'Connected' : 'None (root)'}</span>
              </div>
            </div>

            <div className="h-px bg-[var(--stroke-divider)] my-4" />

            <MemoryContextSidebar
              projectId={routeProjectId || projectId || undefined}
              conversationId={data?.conversationId || data?.sourceConversationId}
              branch={
                data.branchName ||
                (data.pendingBranch === 'main' ? 'main' : data.pendingBranchName) ||
                'main'
              }
            />
          </aside>

          {/* Draggable Divider */}
          <div
            className="w-1.5 bg-[var(--stroke-divider)] cursor-col-resize shrink-0 hover:bg-[var(--hover-bg-strong)] active:bg-blue-500 transition-colors relative group"
            onMouseDown={handleDividerMouseDown}
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-10 bg-[var(--text-tertiary)] rounded-sm opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {/* Main Content - Chat Interface */}
          <div className="flex-1 min-w-0 flex flex-col h-full">
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto p-[var(--space-page)] flex flex-col gap-[var(--space-group)]"
              onScroll={handleChatScroll}
            >
              {isChatLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-center gap-2">
                  <Loader2 size={48} strokeWidth={1} className="animate-spin" />
                  <p className="text-base font-medium text-muted-foreground">
                    Loading conversation...
                  </p>
                </div>
              ) : chatMessages.length === 0 && !isChatStreaming ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-center gap-2">
                  <MessageSquarePlus size={48} strokeWidth={1} />
                  <p className="text-base font-medium text-foreground">No messages yet</p>
                  <span className="text-[0.85rem] text-muted-foreground">
                    Type a message below to start the conversation
                  </span>
                </div>
              ) : (
                <>
                  {/* Load more indicator at top */}
                  {isLoadingMore && (
                    <div className="flex items-center justify-center gap-2 py-3 text-[var(--text-tertiary)] text-[13px]">
                      <Loader2 size={16} className="animate-spin" />
                      <span>Loading older messages...</span>
                    </div>
                  )}
                  {chatHasMore && !isLoadingMore && (
                    <div className="flex items-center justify-center gap-2 py-3 text-[var(--text-tertiary)] text-[13px]">
                      <Button variant="outline" size="sm" onClick={loadMoreMessages}>
                        Load older messages
                      </Button>
                    </div>
                  )}
                  {chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        'max-w-[80%] py-3 px-4 rounded-2xl animate-in fade-in slide-in-from-bottom-2 duration-[var(--duration-normal)]',
                        msg.role === 'user'
                          ? 'self-end bg-blue-500 text-white rounded-br-sm'
                          : 'self-start bg-[var(--hover-bg)] text-[var(--text-primary)] rounded-bl-sm'
                      )}
                    >
                      <div className="text-[0.9rem] leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {/* Streaming response */}
                  {isChatStreaming && streamingContent && (
                    <div className="max-w-[80%] self-start py-3 px-4 rounded-2xl rounded-bl-sm bg-[var(--status-info-muted)] text-[var(--text-primary)]">
                      <div className="text-[0.9rem] leading-relaxed whitespace-pre-wrap">
                        {streamingContent}
                        <span className="animate-pulse text-blue-500">▊</span>
                      </div>
                    </div>
                  )}
                  {/* Loading indicator when streaming starts */}
                  {isChatStreaming && !streamingContent && (
                    <div className="max-w-[80%] self-start py-3 px-4 rounded-2xl rounded-bl-sm bg-[var(--hover-bg)] text-[var(--text-primary)]">
                      <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
                        <Loader2 size={16} className="animate-spin" />
                        <span>Thinking...</span>
                      </div>
                    </div>
                  )}
                  {/* Chat error */}
                  {chatError && (
                    <div className="flex items-center gap-2 py-3 px-4 mx-6 my-2 bg-[var(--status-error-muted)] border border-[var(--status-error)]/20 rounded-lg text-[var(--status-error)] text-[0.85rem]">
                      <AlertCircle size={16} />
                      <span>{chatError}</span>
                    </div>
                  )}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="px-6 py-4 border-t border-[var(--stroke-divider)] bg-[var(--surface-app)] flex gap-3 items-end">
              <Textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
                rows={3}
                disabled={isChatStreaming || isChatLoading}
                className="flex-1 resize-none"
              />
              <Button
                size="icon"
                onClick={handleSendMessage}
                disabled={!chatInput.trim() || isChatStreaming || isChatLoading}
                className="h-11 w-11 rounded-xl shrink-0"
              >
                {isChatStreaming || isChatLoading ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Send size={20} />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
