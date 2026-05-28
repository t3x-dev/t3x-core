'use client';

import {
  AlertCircle,
  FileText,
  FolderInput,
  GitBranch,
  GitCommitHorizontal,
  Leaf,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { UserMenu } from '@/components/layout/UserMenu';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DEFAULT_PROJECT_NAME } from '@/domain/project/defaults';
import { useCommitsList } from '@/hooks/commits/useCommitsList';
import { useNewProjectChat } from '@/hooks/conversations/useNewProjectChat';
import { useProjectConversations } from '@/hooks/conversations/useProjectConversations';
import { useTemporaryChatImport } from '@/hooks/conversations/useTemporaryChatImport';
import { useProjectLeaves } from '@/hooks/leaves/useProjectLeaves';
import { useProjects } from '@/hooks/projects/useProjects';
import { useChatCompactViewport } from '@/hooks/shared/useChatCompactViewport';
import { CHAT_SIDEBAR_COLLAPSED_WIDTH, useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';
import { type TemporaryChat, useTemporaryChatsStore } from '@/store/temporaryChatsStore';
import type { ApiCommit, Leaf as ApiLeaf } from '@/types/api';
import { cn } from '@/utils/cn';
import { buildReturnTo, withReturnTo } from '@/utils/navigationReturn';
import { glass } from '@/utils/theme';
import { ContextMenuPortal, useContextMenu } from './sidebar/ContextMenu';
import { LogoIcon } from './sidebar/LogoIcon';
import { ProjectFolder } from './sidebar/ProjectFolder';

// ── Main Sidebar ──

const PROJECTS_COLLAPSED_MAX_HEIGHT = 220;

type RenameTarget =
  | {
      kind: 'project';
      projectId: string;
      currentName: string;
    }
  | {
      kind: 'conversation';
      projectId: string;
      conversationId: string;
      currentName: string;
    };

type LeafFilter = 'all' | 'generated' | 'draft' | 'review';

interface ImportBranchBaseline {
  branch: string;
  commit: ApiCommit | null;
}

interface CommitCreatedSidebarEvent {
  type?: string;
  projectId?: string;
  conversationId?: string | null;
  conversationIds?: string[];
  branch?: string;
  payload?: {
    hash?: string;
    branch?: string;
  };
}

function shortHash(hash: string): string {
  return hash.replace(/^sha256:/, '').slice(0, 8);
}

function getLatestCommitByBranch(commits: ApiCommit[]): ImportBranchBaseline[] {
  const latest = new Map<string, ApiCommit>();

  for (const commit of commits) {
    const branch = commit.branch || 'main';
    const current = latest.get(branch);
    if (
      !current ||
      new Date(commit.committed_at).getTime() > new Date(current.committed_at).getTime()
    ) {
      latest.set(branch, commit);
    }
  }

  return [...latest.entries()]
    .map(([branch, commit]) => ({ branch, commit }))
    .sort((a, b) => {
      if (a.branch === 'main') return -1;
      if (b.branch === 'main') return 1;
      return a.branch.localeCompare(b.branch);
    });
}

function getLeafAssertionCounts(leaf: ApiLeaf): { total: number; passed: number } {
  const assertions = leaf.runner_assertions ?? leaf.assertions ?? [];
  return {
    total: assertions.length,
    passed: assertions.filter((assertion) => assertion.passed).length,
  };
}

function notifyProjectConversationsLoadFailure(err: unknown) {
  const detail = err instanceof Error ? err.message : 'Unknown error';
  toast.error(`Failed to load conversations: ${detail}`, {
    id: 'project-conversations-load-error',
  });
}

function buildCurrentReturnTo(pathname: string) {
  if (typeof window !== 'undefined' && window.location.pathname === pathname) {
    return buildReturnTo(pathname, window.location.search);
  }
  return buildReturnTo(pathname);
}

function getLeafStatus(leaf: ApiLeaf): 'generated' | 'draft' | 'review' {
  const assertions = leaf.runner_assertions ?? leaf.assertions ?? [];
  if (assertions.some((assertion) => !assertion.passed)) return 'review';
  if (leaf.output || leaf.generated_at) return 'generated';
  return 'draft';
}

export function ChatSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectError, setNewProjectError] = useState<string | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [canvasCommits, setCanvasCommits] = useState<ApiCommit[]>([]);
  const [canvasCommitsLoading, setCanvasCommitsLoading] = useState(false);
  const [canvasCommitsError, setCanvasCommitsError] = useState<string | null>(null);
  const [projectMainCommitHashes, setProjectMainCommitHashes] = useState<Record<string, string>>(
    {}
  );
  const [projectConversationCommitHashes, setProjectConversationCommitHashes] = useState<
    Record<string, Record<string, string>>
  >({});
  const [leafFilter, setLeafFilter] = useState<LeafFilter>('all');
  const [importTargetId, setImportTargetId] = useState<string | null>(null);
  const [importProjectId, setImportProjectId] = useState<string>('');
  const [importBranch, setImportBranch] = useState('main');
  const [importBranchBaselines, setImportBranchBaselines] = useState<ImportBranchBaseline[]>([]);
  const [importBranchesLoading, setImportBranchesLoading] = useState(false);
  const [importBranchesError, setImportBranchesError] = useState<string | null>(null);
  const [importNewProjectName, setImportNewProjectName] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [temporaryDeleteTargetId, setTemporaryDeleteTargetId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const {
    sidebarCollapsed: collapsed,
    sidebarResizing,
    activeConversationId,
    activeProjectId,
    activeBranch,
    expandedProjectIds,
    setActiveConversation,
    setActiveBranch,
    setConversationTitle,
    sidebarWidth,
    setSidebarWidth,
    setSidebarResizing,
  } = useChatStore();
  const compactViewport = useChatCompactViewport();
  const setCommitConversationTitle = useCommitStore((s) => s.setConversationTitle);
  const setCommitBranch = useCommitStore((s) => s.setCommitBranch);
  const temporaryChats = useTemporaryChatsStore((s) => s.chats);
  const getOrCreateEmptyTemporaryChat = useTemporaryChatsStore((s) => s.getOrCreateEmptyChat);
  const removeTemporaryChat = useTemporaryChatsStore((s) => s.removeChat);

  const {
    projects,
    refresh: refreshProjects,
    remove: removeProject,
    create: createProject,
    rename: renameProject,
  } = useProjects();
  const {
    conversationsByProject: projectConversations,
    load: loadConversations,
    remove: removeConversationFn,
    rename: renameConversation,
  } = useProjectConversations();
  const { start: startNewChat } = useNewProjectChat();
  const { importChat } = useTemporaryChatImport();
  const { loadCommits } = useCommitsList();

  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const wasCompactViewportRef = useRef(false);

  const refreshKey = useChatStore((s) => s.refreshKey);
  const importTarget = useMemo(
    () => temporaryChats.find((chat) => chat.id === importTargetId) ?? null,
    [importTargetId, temporaryChats]
  );
  const selectedImportBaseline = useMemo<ImportBranchBaseline>(
    () =>
      importBranchBaselines.find((baseline) => baseline.branch === importBranch) ?? {
        branch: importBranch || 'main',
        commit: null,
      },
    [importBranch, importBranchBaselines]
  );
  const temporaryDeleteTarget = useMemo(
    () => temporaryChats.find((chat) => chat.id === temporaryDeleteTargetId) ?? null,
    [temporaryDeleteTargetId, temporaryChats]
  );

  const routeProjectId = useMemo(() => {
    const match = pathname.match(/^\/chat\/project\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }, [pathname]);
  const effectiveProjectId = routeProjectId ?? activeProjectId;
  const workspaceMode = pathname.includes('/canvas')
    ? 'canvas'
    : pathname.includes('/leaf')
      ? 'leaf'
      : 'chat';
  const isChatActive = workspaceMode === 'chat';
  const isCanvasActive = workspaceMode === 'canvas';
  const isLeafActive = workspaceMode === 'leaf';
  const activeLeafId = useMemo(() => {
    const match = pathname.match(/^\/chat\/project\/[^/]+\/leaf\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }, [pathname]);

  const currentProject = useMemo(() => {
    if (effectiveProjectId) {
      return projects.find((project) => project.project_id === effectiveProjectId) ?? null;
    }
    if (!activeConversationId) return null;
    return (
      projects.find((project) =>
        (projectConversations[project.project_id] ?? []).some(
          (conversation) => conversation.conversation_id === activeConversationId
        )
      ) ?? null
    );
  }, [activeConversationId, effectiveProjectId, projectConversations, projects]);

  const currentProjectId = currentProject?.project_id ?? effectiveProjectId;
  const { leaves: projectLeaves, loading: projectLeavesLoading } = useProjectLeaves(
    currentProjectId,
    Boolean(currentProjectId && !collapsed && (isCanvasActive || isLeafActive))
  );

  const sortedTemporaryChats = useMemo(
    () =>
      [...temporaryChats].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [temporaryChats]
  );

  const filteredLeaves = useMemo(() => {
    if (leafFilter === 'all') return projectLeaves;
    return projectLeaves.filter((leaf) => getLeafStatus(leaf) === leafFilter);
  }, [leafFilter, projectLeaves]);

  const leafStatusCounts = useMemo(() => {
    return projectLeaves.reduce(
      (counts, leaf) => {
        counts[getLeafStatus(leaf)] += 1;
        return counts;
      },
      { all: projectLeaves.length, generated: 0, draft: 0, review: 0 }
    );
  }, [projectLeaves]);
  const currentProjectCommitCount = currentProject?.commits_count ?? canvasCommits.length;
  const canvasBranchCount = useMemo(
    () => new Set(canvasCommits.map((commit) => commit.branch || 'main')).size,
    [canvasCommits]
  );

  const applyCommitCreatedMessage = useCallback((message: CommitCreatedSidebarEvent | null) => {
    if (!message) return;
    if (message.type !== 'commit.created') return;
    const projectId = typeof message.projectId === 'string' ? message.projectId : null;
    const hash =
      typeof message.payload?.hash === 'string'
        ? message.payload.hash
        : typeof (message as { hash?: unknown }).hash === 'string'
          ? (message as { hash: string }).hash
          : null;
    if (!projectId || !hash) return;

    const conversationIds = [
      ...(Array.isArray(message.conversationIds) ? message.conversationIds : []),
      ...(typeof message.conversationId === 'string' ? [message.conversationId] : []),
    ].filter((id, index, ids): id is string => id.length > 0 && ids.indexOf(id) === index);

    if (conversationIds.length > 0) {
      setProjectConversationCommitHashes((prev) => ({
        ...prev,
        [projectId]: {
          ...(prev[projectId] ?? {}),
          ...Object.fromEntries(conversationIds.map((conversationId) => [conversationId, hash])),
        },
      }));
    }

    const branch = message.branch ?? message.payload?.branch;
    if (branch === 'main') {
      setProjectMainCommitHashes((prev) => ({ ...prev, [projectId]: hash }));
    }
  }, []);

  const sidebarVisibleWidth = collapsed
    ? `${CHAT_SIDEBAR_COLLAPSED_WIDTH}px`
    : compactViewport
      ? `min(${sidebarWidth}px, calc(100vw - ${CHAT_SIDEBAR_COLLAPSED_WIDTH}px))`
      : `${sidebarWidth}px`;
  const sidebarStyle = {
    width: sidebarVisibleWidth,
    '--chat-sidebar-visible-width': sidebarVisibleWidth,
  } as React.CSSProperties;

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (collapsed || compactViewport) return;
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startWidth = useChatStore.getState().sidebarWidth;
      setSidebarResizing(true);

      const handleMove = (ev: MouseEvent) => {
        setSidebarWidth(startWidth + ev.clientX - startX);
      };

      const handleUp = () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
        window.removeEventListener('blur', handleUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setSidebarResizing(false);
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
      window.addEventListener('blur', handleUp);
    },
    [collapsed, compactViewport, setSidebarResizing, setSidebarWidth]
  );

  const handleResizeKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (collapsed || compactViewport) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      setSidebarWidth(sidebarWidth + (e.key === 'ArrowRight' ? 16 : -16));
    },
    [collapsed, compactViewport, setSidebarWidth, sidebarWidth]
  );

  useEffect(() => {
    if (compactViewport && !wasCompactViewportRef.current) {
      useChatStore.setState({ sidebarCollapsed: true });
    }
    wasCompactViewportRef.current = compactViewport;
  }, [compactViewport]);

  // Re-fetch projects when refreshKey changes (useProjects does the initial load)
  useEffect(() => {
    if (refreshKey === 0) return;
    void refreshProjects();
  }, [refreshKey, refreshProjects]);

  useEffect(() => {
    if (!importTarget || !importProjectId || importProjectId === '__new__') {
      setImportBranchBaselines([]);
      setImportBranchesLoading(false);
      setImportBranchesError(null);
      return;
    }

    let cancelled = false;
    const preferredBranch = importProjectId === currentProjectId ? activeBranch || 'main' : 'main';

    setImportBranchesLoading(true);
    setImportBranchesError(null);

    void loadCommits(importProjectId, undefined, 100)
      .then((commits) => {
        if (cancelled) return;
        const baselines = getLatestCommitByBranch(commits);
        if (!baselines.some((baseline) => baseline.branch === preferredBranch)) {
          baselines.push({ branch: preferredBranch, commit: null });
        }
        if (!baselines.some((baseline) => baseline.branch === 'main')) {
          baselines.unshift({ branch: 'main', commit: null });
        }

        setImportBranchBaselines(baselines);
        setImportBranch((current) => {
          if (baselines.some((baseline) => baseline.branch === current)) return current;
          if (baselines.some((baseline) => baseline.branch === preferredBranch)) {
            return preferredBranch;
          }
          return baselines[0]?.branch ?? 'main';
        });
      })
      .catch(() => {
        if (cancelled) return;
        setImportBranchBaselines([{ branch: preferredBranch, commit: null }]);
        setImportBranch(preferredBranch);
        setImportBranchesError('Failed to load branches. Import will start without a baseline.');
      })
      .finally(() => {
        if (!cancelled) setImportBranchesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeBranch, currentProjectId, importProjectId, importTarget, loadCommits]);

  useEffect(() => {
    const handleWindowCommit = (event: Event) => {
      applyCommitCreatedMessage((event as CustomEvent<CommitCreatedSidebarEvent>).detail);
    };
    window.addEventListener('t3x:commit-created', handleWindowCommit);

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('t3x-commits');
      channel.onmessage = (event: MessageEvent<CommitCreatedSidebarEvent>) => {
        applyCommitCreatedMessage(event.data);
      };
    }

    return () => {
      window.removeEventListener('t3x:commit-created', handleWindowCommit);
      channel?.close();
    };
  }, [applyCommitCreatedMessage]);

  useEffect(() => {
    if (!routeProjectId || activeProjectId === routeProjectId) return;
    setActiveConversation(null, routeProjectId);
  }, [activeProjectId, routeProjectId, setActiveConversation]);

  useEffect(() => {
    let cancelled = false;
    const projectsWithCommits = projects.filter((project) => (project.commits_count ?? 0) > 0);

    if (projectsWithCommits.length === 0) {
      setProjectMainCommitHashes({});
      return;
    }

    async function loadMainCommitHeads() {
      const entries = await Promise.all(
        projectsWithCommits.map(async (project) => {
          try {
            const commits = await loadCommits(project.project_id, 'main', 1);
            return [project.project_id, commits[0]?.hash ?? null] as const;
          } catch {
            return [project.project_id, null] as const;
          }
        })
      );

      if (cancelled) return;

      setProjectMainCommitHashes(
        Object.fromEntries(
          entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
        )
      );
    }

    void loadMainCommitHeads();

    return () => {
      cancelled = true;
    };
  }, [loadCommits, projects, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    const projectsWithCommits = projects.filter((project) => (project.commits_count ?? 0) > 0);

    if (projectsWithCommits.length === 0) {
      setProjectConversationCommitHashes({});
      return;
    }

    async function loadConversationCommitHeads() {
      const entries = await Promise.all(
        projectsWithCommits.map(async (project) => {
          try {
            const commits = await loadCommits(project.project_id, undefined, 100);
            const conversationHashes: Record<string, string> = {};
            for (const commit of commits) {
              for (const source of commit.sources ?? []) {
                if (source.type !== 'conversation' || conversationHashes[source.id]) continue;
                conversationHashes[source.id] = commit.hash;
              }
            }
            return [project.project_id, conversationHashes] as const;
          } catch {
            return [project.project_id, {}] as const;
          }
        })
      );

      if (cancelled) return;

      setProjectConversationCommitHashes(Object.fromEntries(entries));
    }

    void loadConversationCommitHeads();

    return () => {
      cancelled = true;
    };
  }, [loadCommits, projects, refreshKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadCanvasCommits() {
      if (!isCanvasActive || !currentProjectId || collapsed) {
        setCanvasCommits([]);
        setCanvasCommitsError(null);
        setCanvasCommitsLoading(false);
        return;
      }

      setCanvasCommitsLoading(true);
      setCanvasCommitsError(null);
      try {
        const commits = await loadCommits(currentProjectId, undefined, 40);
        if (!cancelled) {
          setCanvasCommits(commits);
        }
      } catch (err) {
        if (!cancelled) {
          setCanvasCommitsError(err instanceof Error ? err.message : 'Failed to load commits');
          setCanvasCommits([]);
        }
      } finally {
        if (!cancelled) {
          setCanvasCommitsLoading(false);
        }
      }
    }

    void loadCanvasCommits();

    return () => {
      cancelled = true;
    };
  }, [collapsed, currentProjectId, isCanvasActive, loadCommits, refreshKey]);

  // Fetch conversations for expanded projects and the active top workbench
  // project (re-fetch on refreshKey).
  useEffect(() => {
    const projectIdsToLoad = new Set(expandedProjectIds);
    if (effectiveProjectId) {
      projectIdsToLoad.add(effectiveProjectId);
    }
    for (const projectId of Array.from(projectIdsToLoad)) {
      void Promise.resolve(loadConversations(projectId)).catch(
        notifyProjectConversationsLoadFailure
      );
    }
  }, [effectiveProjectId, expandedProjectIds, refreshKey, loadConversations]);

  useEffect(() => {
    if (!renameTarget) return;
    const frame = requestAnimationFrame(() => {
      renameInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [renameTarget]);

  function handleConversationClick(convId: string, projectId: string) {
    setActiveConversation(convId, projectId);
    router.push(`/chat/${convId}`);
  }

  function handleTemporaryChatClick(chatId: string) {
    setActiveConversation(chatId, null);
    router.push(`/chat/${encodeURIComponent(chatId)}`);
  }

  async function handleProjectClick(projectId: string, knownConversationCount?: number) {
    const store = useChatStore.getState();
    const wasExpanded = store.expandedProjectIds.has(projectId);
    const cachedConversations = projectConversations[projectId];
    const conversationCount = knownConversationCount ?? cachedConversations?.length;

    if (conversationCount === 0) {
      if (wasExpanded && store.activeProjectId === projectId) {
        store.toggleProjectExpanded(projectId);
        return;
      }
      if (!wasExpanded) {
        store.toggleProjectExpanded(projectId);
      }
      setActiveConversation(null, projectId);
      router.push(`/chat?projectId=${encodeURIComponent(projectId)}`);
      return;
    }

    if (wasExpanded) {
      store.toggleProjectExpanded(projectId);
      return;
    }

    if (!wasExpanded) {
      store.toggleProjectExpanded(projectId);
    }

    if (cachedConversations?.length) {
      handleConversationClick(cachedConversations[0].conversation_id, projectId);
      return;
    }

    setActiveConversation(null, projectId);
    const loadedConversations = await Promise.resolve(loadConversations(projectId)).catch((err) => {
      notifyProjectConversationsLoadFailure(err);
      return [];
    });
    if (loadedConversations.length > 0) {
      handleConversationClick(loadedConversations[0].conversation_id, projectId);
    }
  }

  const openNewProjectDialog = useCallback(() => {
    setNewProjectName('');
    setNewProjectError(null);
    setNewProjectDialogOpen(true);
  }, []);

  const handleNewProjectDialogOpenChange = useCallback(
    (open: boolean) => {
      if (isCreatingProject) return;
      setNewProjectDialogOpen(open);
      if (!open) {
        setNewProjectName('');
        setNewProjectError(null);
      }
    },
    [isCreatingProject]
  );

  async function handleCreateProject(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (isCreatingProject) return;

    const name = newProjectName.trim() || DEFAULT_PROJECT_NAME;
    setIsCreatingProject(true);
    setNewProjectError(null);

    try {
      const project = await createProject(name);
      // Prime the store and URL so the first message on the landing route
      // becomes a project conversation instead of a temporary chat.
      setActiveConversation(null, project.project_id);
      // Expand the new folder so the user sees the empty state
      // ("No conversations") under the highlighted project, reinforcing
      // that this is where their next chat will land.
      const store = useChatStore.getState();
      if (!store.expandedProjectIds.has(project.project_id)) {
        store.toggleProjectExpanded(project.project_id);
      }
      store.refreshSidebar();
      setNewProjectDialogOpen(false);
      setNewProjectName('');
      router.push(`/chat?projectId=${encodeURIComponent(project.project_id)}`);
    } catch {
      setNewProjectError('Failed to create project');
    } finally {
      setIsCreatingProject(false);
    }
  }

  async function handleNewChatInProject(projectId: string) {
    const convId = await startNewChat(projectId);
    if (!convId) {
      router.push('/chat');
      return;
    }
    setActiveConversation(convId, projectId);
    router.push(`/chat/${convId}`);
    useChatStore.getState().refreshSidebar();
  }

  function openTemporaryImportDialog(chat: TemporaryChat) {
    const defaultProjectId = currentProjectId ?? projects[0]?.project_id ?? '__new__';
    const defaultBranch = defaultProjectId === currentProjectId ? activeBranch || 'main' : 'main';

    setImportTargetId(chat.id);
    setImportProjectId(defaultProjectId);
    setImportBranch(defaultBranch);
    setImportBranchBaselines([]);
    setImportBranchesError(null);
    setImportBranchesLoading(false);
    setImportNewProjectName('');
    setImportError(null);
  }

  function handleImportDialogOpenChange(open: boolean) {
    if (isImporting) return;
    if (!open) {
      setImportTargetId(null);
      setImportProjectId('');
      setImportBranch('main');
      setImportBranchBaselines([]);
      setImportBranchesError(null);
      setImportBranchesLoading(false);
      setImportNewProjectName('');
      setImportError(null);
    }
  }

  async function handleImportTemporaryChat(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!importTarget || isImporting) return;

    setIsImporting(true);
    setImportError(null);
    try {
      const project =
        importProjectId === '__new__' || !importProjectId
          ? await createProject(importNewProjectName.trim() || DEFAULT_PROJECT_NAME)
          : projects.find((item) => item.project_id === importProjectId);

      if (!project) {
        setImportError('Select a project to import into');
        return;
      }

      const selectedBranch =
        importProjectId === '__new__' || !importProjectId ? 'main' : selectedImportBaseline.branch;
      const parentCommitHash =
        importProjectId === '__new__' || !importProjectId
          ? undefined
          : selectedImportBaseline.commit?.hash;
      const conversation = await importChat({ chat: importTarget, project, parentCommitHash });

      removeTemporaryChat(importTarget.id);
      await loadConversations(project.project_id);
      await refreshProjects();
      useChatStore.getState().refreshSidebar();
      setActiveConversation(conversation.conversation_id, project.project_id);
      setActiveBranch(selectedBranch);
      setCommitBranch(selectedBranch);
      setConversationTitle(conversation.title ?? importTarget.title);
      setCommitConversationTitle(conversation.title ?? importTarget.title);
      setImportTargetId(null);
      setImportProjectId('');
      setImportBranch('main');
      setImportBranchBaselines([]);
      setImportBranchesError(null);
      setImportBranchesLoading(false);
      setImportNewProjectName('');
      router.push(`/chat/${conversation.conversation_id}`);
    } catch {
      setImportError('Failed to import temporary chat');
    } finally {
      setIsImporting(false);
    }
  }

  function handleCanvasClick(projectId: string) {
    router.push(`/chat/project/${encodeURIComponent(projectId)}/canvas`);
  }

  function expandSidebarFromRail() {
    if (collapsed && !compactViewport) {
      useChatStore.setState({ sidebarCollapsed: false });
    }
  }

  function handleChatTabClick() {
    expandSidebarFromRail();
    if (activeConversationId) {
      router.push(`/chat/${activeConversationId}`);
      return;
    }
    if (currentProjectId) {
      router.push(`/chat?projectId=${encodeURIComponent(currentProjectId)}`);
      return;
    }
    router.push('/chat');
  }

  function handleCanvasTabClick() {
    expandSidebarFromRail();
    if (!currentProjectId) return;
    handleCanvasClick(currentProjectId);
  }

  function handleLeafTabClick() {
    expandSidebarFromRail();
    if (!currentProjectId) return;
    router.push(`/chat/project/${encodeURIComponent(currentProjectId)}/leaf`);
  }

  function handleNewTemporaryChatClick() {
    const chat = getOrCreateEmptyTemporaryChat('Temporary chat');
    setActiveConversation(chat.id, null);
    setConversationTitle(chat.title);
    setCommitConversationTitle(chat.title);
    router.push(`/chat/${encodeURIComponent(chat.id)}`);
  }

  function handleTemporaryDeleteDialogOpenChange(open: boolean) {
    if (!open) setTemporaryDeleteTargetId(null);
  }

  function handleConfirmDeleteTemporaryChat() {
    if (!temporaryDeleteTarget) return;
    const deletedChatId = temporaryDeleteTarget.id;
    removeTemporaryChat(deletedChatId);
    setTemporaryDeleteTargetId(null);
    if (activeConversationId === deletedChatId) {
      setActiveConversation(null, null);
      router.push('/chat');
    }
  }

  async function handleDeleteProject(projectId: string) {
    if (!window.confirm('Are you sure you want to delete this project? This cannot be undone.')) {
      return;
    }
    try {
      await removeProject(projectId);
      window.location.reload();
    } catch {
      // silently fail
    }
  }

  async function handleDeleteConversation(projectId: string, convId: string) {
    if (!window.confirm('Are you sure you want to delete this conversation?')) {
      return;
    }
    try {
      await removeConversationFn(projectId, convId);
      window.location.reload();
    } catch {
      // silently fail
    }
  }

  const openRenameDialog = useCallback((target: RenameTarget) => {
    setRenameTarget(target);
    setRenameValue(target.currentName);
    setRenameError(null);
  }, []);

  const handleRenameDialogOpenChange = useCallback(
    (open: boolean) => {
      if (isRenaming) return;
      if (!open) {
        setRenameTarget(null);
        setRenameValue('');
        setRenameError(null);
      }
    },
    [isRenaming]
  );

  async function handleRenameSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!renameTarget || isRenaming) return;

    const nextName = renameValue.trim();
    if (!nextName) {
      setRenameError('Name is required');
      return;
    }
    if (nextName === renameTarget.currentName.trim()) {
      handleRenameDialogOpenChange(false);
      return;
    }

    setIsRenaming(true);
    setRenameError(null);

    try {
      if (renameTarget.kind === 'project') {
        await renameProject(renameTarget.projectId, nextName);
      } else {
        const conversation = await renameConversation(
          renameTarget.projectId,
          renameTarget.conversationId,
          nextName
        );
        const title = conversation.title ?? nextName;
        if (activeConversationId === renameTarget.conversationId) {
          setConversationTitle(title);
          setCommitConversationTitle(title);
        }
      }
      setRenameTarget(null);
      setRenameValue('');
    } catch {
      setRenameError(
        renameTarget.kind === 'project'
          ? 'Failed to rename project'
          : 'Failed to rename conversation'
      );
    } finally {
      setIsRenaming(false);
    }
  }

  function handleProjectContextMenu(e: React.MouseEvent, projectId: string) {
    const project = projects.find((item) => item.project_id === projectId);
    const projectName = project?.name?.trim() || DEFAULT_PROJECT_NAME;

    openMenu(e, [
      {
        label: 'Rename',
        icon: <Pencil className="h-3.5 w-3.5" />,
        onClick: () =>
          openRenameDialog({
            kind: 'project',
            projectId,
            currentName: projectName,
          }),
      },
      {
        label: 'Delete Project',
        icon: <Trash2 className="h-3.5 w-3.5" />,
        danger: true,
        onClick: () => handleDeleteProject(projectId),
      },
    ]);
  }

  function handleConversationContextMenu(e: React.MouseEvent, projectId: string, convId: string) {
    const conversation = (projectConversations[projectId] ?? []).find(
      (item) => item.conversation_id === convId
    );
    const conversationName = conversation?.title?.trim() || 'Untitled Conversation';

    openMenu(e, [
      {
        label: 'Rename',
        icon: <Pencil className="h-3.5 w-3.5" />,
        onClick: () =>
          openRenameDialog({
            kind: 'conversation',
            projectId,
            conversationId: convId,
            currentName: conversationName,
          }),
      },
      {
        label: 'Delete Conversation',
        icon: <Trash2 className="h-3.5 w-3.5" />,
        danger: true,
        onClick: () => handleDeleteConversation(projectId, convId),
      },
    ]);
  }

  function handleTemporaryChatContextMenu(e: React.MouseEvent, chat: TemporaryChat) {
    const items = [
      ...(chat.messages.length > 0
        ? [
            {
              label: 'Import to Project',
              icon: <FolderInput className="h-3.5 w-3.5" />,
              onClick: () => openTemporaryImportDialog(chat),
            },
          ]
        : []),
      {
        label: 'Delete Temporary Chat',
        icon: <Trash2 className="h-3.5 w-3.5" />,
        danger: true,
        onClick: () => setTemporaryDeleteTargetId(chat.id),
      },
    ];
    openMenu(e, items);
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        aria-label="Chat navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex h-dvh flex-col overflow-hidden border-r border-[var(--stroke-default)] bg-[var(--sidebar-panel)] backdrop-blur-[var(--fx-blur-panel)]',
          !sidebarResizing &&
            'transition-[width] duration-[var(--motion-slow)] ease-[var(--ease-out-soft)]',
          glass.highlight,
          collapsed ? 'items-center' : ''
        )}
        style={sidebarStyle}
      >
        <div
          className={cn(
            'flex h-14 shrink-0 items-center bg-[var(--sidebar-panel)] px-3',
            collapsed && 'justify-center'
          )}
        >
          <button
            type="button"
            onClick={handleChatTabClick}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-opacity hover:opacity-80"
            aria-label="T3X chat home"
          >
            <LogoIcon />
          </button>
        </div>

        {collapsed ? (
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1 px-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleChatTabClick}
                  className={cn(
                    'relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors',
                    isChatActive
                      ? 'border-[var(--accent-conversation)]/20 bg-[var(--accent-conversation-soft)] text-[var(--accent-conversation)]'
                      : 'border-transparent text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--accent-conversation)]'
                  )}
                  aria-label="Chat"
                  aria-current={isChatActive ? 'page' : undefined}
                >
                  {isChatActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-[-8px] h-5 w-[3px] rounded-full bg-[var(--accent-conversation)]"
                    />
                  )}
                  <MessageSquare className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Chat
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleCanvasTabClick}
                  disabled={!currentProjectId}
                  className={cn(
                    'relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-[var(--text-tertiary)]',
                    isCanvasActive
                      ? 'border-[var(--accent-commit)]/20 bg-[var(--accent-commit-soft)] text-[var(--accent-commit)]'
                      : 'border-transparent text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--accent-commit)]'
                  )}
                  aria-label="Canvas"
                  aria-current={isCanvasActive ? 'page' : undefined}
                >
                  {isCanvasActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-[-8px] h-5 w-[3px] rounded-full bg-[var(--accent-commit)]"
                    />
                  )}
                  <GitBranch className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Canvas
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleLeafTabClick}
                  disabled={!currentProjectId}
                  className={cn(
                    'relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-[var(--text-tertiary)]',
                    isLeafActive
                      ? 'border-[var(--accent-leaf)]/20 bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)]'
                      : 'border-transparent text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--accent-leaf)]'
                  )}
                  aria-label="Leaf"
                  aria-current={isLeafActive ? 'page' : undefined}
                >
                  {isLeafActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-[-8px] h-5 w-[3px] rounded-full bg-[var(--accent-leaf)]"
                    />
                  )}
                  <Leaf className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Leaf
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={openNewProjectDialog}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
                  aria-label="New project"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                New Project
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <>
            <div className="px-3 pb-3">
              <div
                className="grid grid-cols-3 gap-0.5 rounded-xl border border-[var(--stroke-divider)] bg-[var(--hover-bg)] p-0.5"
                role="tablist"
                aria-label="Workspace mode"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={isChatActive}
                  aria-current={isChatActive ? 'page' : undefined}
                  onClick={handleChatTabClick}
                  className={cn(
                    'flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-[12px] font-semibold transition-colors',
                    isChatActive
                      ? 'bg-[var(--surface-panel)] text-[var(--text-primary)] shadow-[var(--fx-shadow-sm)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-panel)] hover:text-[var(--text-primary)]'
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5 text-[var(--accent-conversation)]" />
                  <span className="truncate">Chat</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isCanvasActive}
                  onClick={handleCanvasTabClick}
                  disabled={!currentProjectId}
                  className={cn(
                    'flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[var(--text-secondary)]',
                    isCanvasActive
                      ? 'bg-[var(--surface-panel)] text-[var(--text-primary)] shadow-[var(--fx-shadow-sm)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-panel)] hover:text-[var(--text-primary)]'
                  )}
                  title={currentProjectId ? 'Canvas' : 'Select a project before opening Canvas'}
                >
                  <GitBranch className="h-3.5 w-3.5 text-[var(--accent-commit)]" />
                  <span className="truncate">Canvas</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isLeafActive}
                  onClick={handleLeafTabClick}
                  disabled={!currentProjectId}
                  className={cn(
                    'flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[var(--text-secondary)]',
                    isLeafActive
                      ? 'bg-[var(--surface-panel)] text-[var(--text-primary)] shadow-[var(--fx-shadow-sm)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-panel)] hover:text-[var(--text-primary)]'
                  )}
                  title={currentProjectId ? 'Leaf' : 'Select a project before opening Leaf'}
                >
                  <Leaf className="h-3.5 w-3.5 text-[var(--accent-leaf)]" />
                  <span className="truncate">Leaf</span>
                </button>
              </div>
            </div>

            <div className="px-3 pb-2">
              {isChatActive ? (
                <Button
                  variant="ghost"
                  onClick={openNewProjectDialog}
                  className="h-10 w-full justify-between rounded-lg bg-[var(--hover-bg-strong)] px-3 text-[13px] font-semibold text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
                  aria-label="New project"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Plus className="h-4 w-4 shrink-0" />
                    <span className="truncate">New project</span>
                  </span>
                </Button>
              ) : isCanvasActive ? (
                <Button
                  variant="ghost"
                  onClick={handleCanvasTabClick}
                  disabled={!currentProjectId}
                  className="h-10 w-full justify-between rounded-lg bg-[var(--accent-commit-soft)] px-3 text-[13px] font-semibold text-[var(--accent-commit)] hover:bg-[var(--accent-commit)]/15 disabled:opacity-45"
                  aria-label="Open canvas"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <GitBranch className="h-4 w-4 shrink-0" />
                    <span className="truncate">Open canvas</span>
                  </span>
                  <span className="text-[11px] font-medium text-[var(--text-tertiary)]">map</span>
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  onClick={handleLeafTabClick}
                  disabled={!currentProjectId}
                  className="h-10 w-full justify-between rounded-lg bg-[var(--accent-leaf-soft)] px-3 text-[13px] font-semibold text-[var(--accent-leaf)] hover:bg-[var(--accent-leaf)]/15 disabled:opacity-45"
                  aria-label="Leaf index"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Leaf className="h-4 w-4 shrink-0" />
                    <span className="truncate">Leaf index</span>
                  </span>
                  <span className="text-[11px] font-medium text-[var(--text-tertiary)]">
                    {projectLeaves.length}
                  </span>
                </Button>
              )}
            </div>

            {/* Scrollable content: Projects + temporary chats */}
            <ScrollArea className="sidebar-scrollarea min-h-0 min-w-0 flex-1 w-full">
              <div
                className="flex min-w-0 flex-col gap-2 pb-4 pt-0"
                style={{
                  width: 'var(--chat-sidebar-visible-width)',
                  maxWidth: 'var(--chat-sidebar-visible-width)',
                }}
              >
                {isChatActive && (
                  <>
                    <div className="px-3">
                      <div className="px-1 pb-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                          Projects
                        </span>
                      </div>
                    </div>

                    <div
                      className="chat-scrollbar min-w-0 overflow-y-auto overflow-x-hidden pr-1"
                      style={{
                        maxHeight: `${PROJECTS_COLLAPSED_MAX_HEIGHT}px`,
                      }}
                    >
                      {projects.map((project) => (
                        <ProjectFolder
                          key={project.project_id}
                          project={project}
                          conversations={projectConversations[project.project_id] ?? []}
                          isExpanded={expandedProjectIds.has(project.project_id)}
                          isActive={activeProjectId === project.project_id}
                          activeConversationId={activeConversationId}
                          collapsed={false}
                          latestMainCommitHash={projectMainCommitHashes[project.project_id]}
                          conversationCommitHashes={
                            projectConversationCommitHashes[project.project_id]
                          }
                          onToggleExpand={() =>
                            void handleProjectClick(project.project_id, project.conversations_count)
                          }
                          onConversationClick={(convId) =>
                            handleConversationClick(convId, project.project_id)
                          }
                          onNewChat={(pid) => handleNewChatInProject(pid)}
                          onProjectContextMenu={(e) =>
                            handleProjectContextMenu(e, project.project_id)
                          }
                          onConversationContextMenu={(e, convId) =>
                            handleConversationContextMenu(e, project.project_id, convId)
                          }
                        />
                      ))}
                    </div>

                    {projects.length === 0 && (
                      <div className="px-4 py-4 text-center">
                        <span className="text-xs text-[var(--text-tertiary)]">No projects yet</span>
                      </div>
                    )}

                    <div className="px-3">
                      <div className="flex items-center justify-between px-1 pb-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                          Temporary chats
                        </span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={handleNewTemporaryChatClick}
                              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
                              aria-label="New temporary chat"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" sideOffset={8}>
                            New Temporary Chat
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      {sortedTemporaryChats.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-[var(--stroke-divider)] px-3 py-3 text-[11px] leading-4 text-[var(--text-tertiary)]">
                          Start chatting without a project. Import the chat when it is ready to
                          become project work.
                        </div>
                      ) : (
                        <div className="flex min-w-0 flex-col gap-0.5">
                          {sortedTemporaryChats.map((chat) => {
                            const isActive = activeConversationId === chat.id;
                            const canImport = chat.messages.length > 0;
                            return (
                              <div
                                key={chat.id}
                                onContextMenu={(event) =>
                                  handleTemporaryChatContextMenu(event, chat)
                                }
                                className={cn(
                                  'group/temporary relative box-border grid min-h-[44px] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1 overflow-hidden rounded-lg border px-2 py-1.5 transition-all duration-[var(--motion-base)] ease-[var(--ease-out-soft)]',
                                  'hover:bg-[var(--hover-bg)]',
                                  isActive
                                    ? 'border-[var(--accent-conversation)]/20 bg-[var(--accent-conversation-soft)] text-[var(--text-primary)] shadow-none'
                                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleTemporaryChatClick(chat.id)}
                                  className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]/50"
                                >
                                  <span
                                    className={cn(
                                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--hover-bg)]/75 text-[var(--text-tertiary)] transition-colors',
                                      isActive &&
                                        'bg-transparent text-[var(--accent-conversation)]',
                                      !isActive &&
                                        'group-hover/temporary:text-[var(--text-secondary)]'
                                    )}
                                  >
                                    <MessageSquare className="h-4 w-4" />
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block truncate text-[12px] font-medium leading-4">
                                      {chat.title}
                                    </span>
                                    <span
                                      className="block truncate text-[10px] leading-3 text-[var(--text-tertiary)]"
                                      title={`${chat.messages.length} message${chat.messages.length === 1 ? '' : 's'} · not in a project`}
                                    >
                                      {chat.messages.length} message
                                      {chat.messages.length === 1 ? '' : 's'}
                                    </span>
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  aria-label="Import temporary chat"
                                  title={
                                    canImport
                                      ? 'Import temporary chat'
                                      : 'Send a message before importing'
                                  }
                                  disabled={!canImport}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (!canImport) return;
                                    openTemporaryImportDialog(chat);
                                  }}
                                  className={cn(
                                    'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--stroke-divider)] text-[var(--text-tertiary)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]/50',
                                    canImport
                                      ? 'hover:border-[var(--accent-commit)]/30 hover:bg-[var(--accent-commit-soft)] hover:text-[var(--accent-commit)]'
                                      : 'cursor-not-allowed opacity-45'
                                  )}
                                >
                                  <FolderInput className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {isCanvasActive && (
                  <div className="flex min-w-0 flex-col gap-3 px-3">
                    {!currentProjectId ? (
                      <div className="rounded-lg border border-dashed border-[var(--stroke-divider)] px-3 py-5 text-center">
                        <GitBranch className="mx-auto mb-2 h-4 w-4 text-[var(--text-tertiary)]" />
                        <p className="text-xs font-semibold text-[var(--text-primary)]">
                          Select a project
                        </p>
                        <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                          Canvas navigation is project scoped.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3">
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--accent-commit-soft)] text-[var(--accent-commit)]">
                              <GitBranch className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-[12px] font-semibold text-[var(--text-primary)]">
                                {currentProject?.name ?? 'Project'}
                              </span>
                              <span className="block text-[10px] text-[var(--text-tertiary)]">
                                Canvas view · version graph
                              </span>
                            </span>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-1 text-center">
                            <span className="rounded-md bg-[var(--hover-bg)] px-1.5 py-1">
                              <span className="block text-[12px] font-semibold text-[var(--text-primary)]">
                                {currentProjectCommitCount}
                              </span>
                              <span className="block text-[9px] uppercase text-[var(--text-tertiary)]">
                                commits
                              </span>
                            </span>
                            <span className="rounded-md bg-[var(--hover-bg)] px-1.5 py-1">
                              <span className="block text-[12px] font-semibold text-[var(--text-primary)]">
                                {projectLeaves.length}
                              </span>
                              <span className="block text-[9px] uppercase text-[var(--text-tertiary)]">
                                leaves
                              </span>
                            </span>
                            <span className="rounded-md bg-[var(--hover-bg)] px-1.5 py-1">
                              <span className="block text-[12px] font-semibold text-[var(--text-primary)]">
                                {canvasBranchCount || 1}
                              </span>
                              <span className="block text-[9px] uppercase text-[var(--text-tertiary)]">
                                branches
                              </span>
                            </span>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between px-1 pb-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                              Commits
                            </span>
                            <span className="text-[10px] text-[var(--text-tertiary)]">
                              {canvasCommits.length || currentProjectCommitCount}
                            </span>
                          </div>

                          {canvasCommitsLoading && (
                            <div className="flex items-center gap-2 rounded-lg px-2 py-3 text-xs text-[var(--text-tertiary)]">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Loading commits
                            </div>
                          )}

                          {canvasCommitsError && (
                            <div className="flex items-start gap-2 rounded-lg border border-[var(--status-error)]/20 bg-[var(--status-error-muted)] px-2 py-2 text-[11px] text-[var(--status-error)]">
                              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span className="min-w-0 break-words">{canvasCommitsError}</span>
                            </div>
                          )}

                          {!canvasCommitsLoading &&
                            !canvasCommitsError &&
                            canvasCommits.length === 0 && (
                              <div className="rounded-lg border border-dashed border-[var(--stroke-divider)] px-3 py-4 text-center text-xs text-[var(--text-tertiary)]">
                                No commits yet
                              </div>
                            )}

                          <div className="flex min-w-0 flex-col gap-0.5">
                            {canvasCommits.map((commit) => {
                              const commitLeaves = projectLeaves.filter(
                                (leaf) => leaf.commit_hash === commit.hash
                              );
                              return (
                                <button
                                  key={commit.hash}
                                  type="button"
                                  onClick={() =>
                                    router.push(
                                      withReturnTo(
                                        `/project/${currentProjectId}/commit/${encodeURIComponent(
                                          commit.hash
                                        )}`,
                                        buildCurrentReturnTo(pathname)
                                      )
                                    )
                                  }
                                  className="grid min-h-[42px] min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
                                >
                                  <GitCommitHorizontal className="h-4 w-4 shrink-0 text-[var(--accent-commit)]" />
                                  <span className="min-w-0">
                                    <span className="block truncate text-[12px] font-medium leading-4">
                                      {commit.message || shortHash(commit.hash)}
                                    </span>
                                    <span className="block truncate font-mono text-[10px] leading-3 text-[var(--text-tertiary)]">
                                      {commit.branch || 'main'} · {shortHash(commit.hash)}
                                    </span>
                                  </span>
                                  {commitLeaves.length > 0 && (
                                    <span className="rounded-full bg-[var(--accent-leaf-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent-leaf)]">
                                      {commitLeaves.length}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {isLeafActive && (
                  <div className="flex min-w-0 flex-col gap-3 px-3">
                    {!currentProjectId ? (
                      <div className="rounded-lg border border-dashed border-[var(--stroke-divider)] px-3 py-5 text-center">
                        <Leaf className="mx-auto mb-2 h-4 w-4 text-[var(--text-tertiary)]" />
                        <p className="text-xs font-semibold text-[var(--text-primary)]">
                          Select a project
                        </p>
                        <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                          Leaf outputs live under a project.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3">
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)]">
                              <Leaf className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-[12px] font-semibold text-[var(--text-primary)]">
                                {currentProject?.name ?? 'Project'}
                              </span>
                              <span className="block text-[10px] text-[var(--text-tertiary)]">
                                Output artifacts
                              </span>
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1">
                            {(['all', 'generated', 'draft', 'review'] as const).map((filter) => (
                              <button
                                key={filter}
                                type="button"
                                onClick={() => setLeafFilter(filter)}
                                className={cn(
                                  'rounded-md border px-2 py-1 text-[10px] font-semibold capitalize transition-colors',
                                  leafFilter === filter
                                    ? 'border-[var(--accent-leaf)]/25 bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)]'
                                    : 'border-[var(--stroke-divider)] text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
                                )}
                              >
                                {filter} {leafStatusCounts[filter]}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between px-1 pb-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                              Leaves
                            </span>
                            <span className="text-[10px] text-[var(--text-tertiary)]">
                              {filteredLeaves.length}
                            </span>
                          </div>

                          {projectLeavesLoading && (
                            <div className="flex items-center gap-2 rounded-lg px-2 py-3 text-xs text-[var(--text-tertiary)]">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Loading leaves
                            </div>
                          )}

                          {!projectLeavesLoading && filteredLeaves.length === 0 && (
                            <div className="rounded-lg border border-dashed border-[var(--stroke-divider)] px-3 py-4 text-center text-xs text-[var(--text-tertiary)]">
                              No leaves in this view
                            </div>
                          )}

                          <div className="flex min-w-0 flex-col gap-0.5">
                            {filteredLeaves.map((leaf) => {
                              const counts = getLeafAssertionCounts(leaf);
                              const status = getLeafStatus(leaf);
                              const isActive = activeLeafId === leaf.id;
                              return (
                                <button
                                  key={leaf.id}
                                  type="button"
                                  onClick={() =>
                                    router.push(
                                      `/chat/project/${encodeURIComponent(
                                        currentProjectId
                                      )}/leaf/${encodeURIComponent(leaf.id)}`
                                    )
                                  }
                                  className={cn(
                                    'grid min-h-[42px] min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors',
                                    isActive
                                      ? 'border-[var(--accent-leaf)]/25 bg-[var(--accent-leaf-soft)] text-[var(--text-primary)]'
                                      : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
                                  )}
                                >
                                  <FileText
                                    className={cn(
                                      'h-4 w-4 shrink-0',
                                      isActive
                                        ? 'text-[var(--accent-leaf)]'
                                        : 'text-[var(--text-tertiary)]'
                                    )}
                                  />
                                  <span className="min-w-0">
                                    <span className="block truncate text-[12px] font-medium leading-4">
                                      {leaf.title || `Leaf ${leaf.id.slice(0, 8)}`}
                                    </span>
                                    <span className="block truncate text-[10px] leading-3 text-[var(--text-tertiary)]">
                                      {leaf.type} · {status}
                                    </span>
                                  </span>
                                  {counts.total > 0 && (
                                    <span className="rounded-full bg-[var(--hover-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-tertiary)]">
                                      {counts.passed}/{counts.total}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        )}

        <div
          className={cn(
            'mt-auto flex min-w-0 flex-col gap-1 py-2.5',
            collapsed ? 'items-center px-2' : 'px-2.5'
          )}
        >
          <UserMenu collapsed={collapsed} />
        </div>
      </aside>

      {!collapsed && !compactViewport && (
        <button
          type="button"
          aria-label="Resize project sidebar"
          title="Drag to resize sidebar"
          onMouseDown={handleResizeMouseDown}
          onKeyDown={handleResizeKeyDown}
          className="group fixed top-0 z-50 flex h-screen w-2 -translate-x-1/2 cursor-col-resize justify-center border-0 bg-transparent p-0 focus-visible:outline-none"
          style={{ left: sidebarWidth }}
        >
          <span
            aria-hidden="true"
            className={cn(
              'h-full w-px transition-colors',
              sidebarResizing
                ? 'bg-[var(--accent-commit)]/60'
                : 'bg-transparent group-hover:bg-[var(--accent-commit)]/45 group-active:bg-[var(--accent-commit)]/60 group-focus-visible:bg-[var(--accent-commit)]/45'
            )}
          />
        </button>
      )}

      {/* Context menu portal */}
      {menu && <ContextMenuPortal menu={menu} onClose={closeMenu} />}

      <Dialog open={Boolean(renameTarget)} onOpenChange={handleRenameDialogOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <form onSubmit={handleRenameSubmit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>
                Rename {renameTarget?.kind === 'project' ? 'Project' : 'Conversation'}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Update the selected {renameTarget?.kind ?? 'item'} name.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              <label
                htmlFor="rename-name"
                className="text-sm font-medium text-[var(--text-primary)]"
              >
                Name
              </label>
              <Input
                id="rename-name"
                ref={renameInputRef}
                value={renameValue}
                onChange={(event) => {
                  setRenameValue(event.target.value);
                  if (renameError) setRenameError(null);
                }}
                placeholder={
                  renameTarget?.kind === 'conversation'
                    ? 'Untitled Conversation'
                    : DEFAULT_PROJECT_NAME
                }
                disabled={isRenaming}
                aria-invalid={renameError ? 'true' : undefined}
                aria-describedby={renameError ? 'rename-error' : undefined}
              />
              {renameError && (
                <p id="rename-error" className="text-xs text-[var(--status-error)]">
                  {renameError}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleRenameDialogOpenChange(false)}
                disabled={isRenaming}
              >
                Cancel
              </Button>
              <Button type="submit" variant="commit" disabled={isRenaming || !renameValue.trim()}>
                {isRenaming ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(temporaryDeleteTarget)}
        onOpenChange={handleTemporaryDeleteDialogOpenChange}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Temporary Chat</DialogTitle>
            <DialogDescription>
              Delete "{temporaryDeleteTarget?.title ?? 'Temporary chat'}"? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleTemporaryDeleteDialogOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirmDeleteTemporaryChat}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(importTarget)} onOpenChange={handleImportDialogOpenChange}>
        <DialogContent className="sm:max-w-[440px]">
          <form onSubmit={handleImportTemporaryChat} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Import Temporary Chat</DialogTitle>
              <DialogDescription>
                Move "{importTarget?.title ?? 'Temporary chat'}" into a project so it can use
                Extract, Canvas, and Leaf.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              <label
                htmlFor="import-project"
                className="text-sm font-medium text-[var(--text-primary)]"
              >
                Destination
              </label>
              <select
                id="import-project"
                value={importProjectId || '__new__'}
                onChange={(event) => {
                  const nextProjectId = event.target.value;
                  setImportProjectId(nextProjectId);
                  setImportBranch(
                    nextProjectId === currentProjectId ? activeBranch || 'main' : 'main'
                  );
                  setImportBranchBaselines([]);
                  setImportBranchesError(null);
                  if (importError) setImportError(null);
                }}
                disabled={isImporting}
                className="h-9 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-panel)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-commit)]"
              >
                <option value="__new__">New project</option>
                {projects.map((project) => (
                  <option key={project.project_id} value={project.project_id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            {importProjectId && importProjectId !== '__new__' && (
              <div className="grid gap-2">
                <label
                  htmlFor="import-branch"
                  className="text-sm font-medium text-[var(--text-primary)]"
                >
                  Branch baseline
                </label>
                <select
                  id="import-branch"
                  value={importBranch}
                  onChange={(event) => setImportBranch(event.target.value)}
                  disabled={isImporting || importBranchesLoading}
                  className="h-9 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-panel)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-commit)]"
                >
                  {(importBranchBaselines.length > 0
                    ? importBranchBaselines
                    : [{ branch: importBranch || 'main', commit: null }]
                  ).map((baseline) => (
                    <option key={baseline.branch} value={baseline.branch}>
                      {baseline.branch}
                      {baseline.commit ? ` · ${shortHash(baseline.commit.hash)}` : ' · no commits'}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {importBranchesLoading
                    ? 'Loading branch baselines...'
                    : selectedImportBaseline.commit
                      ? `Starts from ${selectedImportBaseline.branch} · ${shortHash(
                          selectedImportBaseline.commit.hash
                        )}`
                      : `Starts from an empty ${selectedImportBaseline.branch || 'main'} branch.`}
                </p>
                {importBranchesError && (
                  <p className="text-xs text-[var(--status-warning)]">{importBranchesError}</p>
                )}
              </div>
            )}

            {(importProjectId === '__new__' || !importProjectId) && (
              <div className="grid gap-2">
                <label
                  htmlFor="import-new-project-name"
                  className="text-sm font-medium text-[var(--text-primary)]"
                >
                  New project name
                </label>
                <Input
                  id="import-new-project-name"
                  value={importNewProjectName}
                  onChange={(event) => {
                    setImportNewProjectName(event.target.value);
                    if (importError) setImportError(null);
                  }}
                  placeholder={DEFAULT_PROJECT_NAME}
                  disabled={isImporting}
                />
              </div>
            )}

            {importError && <p className="text-xs text-[var(--status-error)]">{importError}</p>}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleImportDialogOpenChange(false)}
                disabled={isImporting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="commit" disabled={isImporting}>
                {isImporting ? 'Importing...' : 'Import'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={newProjectDialogOpen} onOpenChange={handleNewProjectDialogOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <form onSubmit={handleCreateProject} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>New Project</DialogTitle>
              <DialogDescription className="sr-only">
                Enter a project name or leave it blank to create an untitled workspace.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              <label
                htmlFor="new-project-name"
                className="text-sm font-medium text-[var(--text-primary)]"
              >
                Project name
              </label>
              <Input
                id="new-project-name"
                autoFocus
                value={newProjectName}
                onChange={(event) => {
                  setNewProjectName(event.target.value);
                  if (newProjectError) setNewProjectError(null);
                }}
                placeholder={DEFAULT_PROJECT_NAME}
                disabled={isCreatingProject}
                aria-invalid={newProjectError ? 'true' : undefined}
                aria-describedby={newProjectError ? 'new-project-error' : undefined}
              />
              {newProjectError && (
                <p id="new-project-error" className="text-xs text-[var(--status-error)]">
                  {newProjectError}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleNewProjectDialogOpenChange(false)}
                disabled={isCreatingProject}
              >
                Cancel
              </Button>
              <Button type="submit" variant="commit" disabled={isCreatingProject}>
                {isCreatingProject ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
