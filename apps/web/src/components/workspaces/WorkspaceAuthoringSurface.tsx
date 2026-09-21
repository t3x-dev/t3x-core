import type {
  TransitionControlPlaneView,
  WorkspaceAuthoringAction,
  WorkspaceAuthoringCard,
  WorkspaceAuthoringView,
} from '@t3x-dev/api-client';
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  History,
  MessageSquare,
  Plus,
  Sparkles,
  User,
  Workflow,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useMaterialUpload } from '@/hooks/materials/useMaterialUpload';
import { useWorkspaceAuthoring } from '@/hooks/workspaces/useWorkspaceAuthoring';
import type { WorkspaceCandidate, WorkspaceProposalPosture } from '@/types/workspaces';
import { DraftNodeChangeDetail } from './DraftNodeChangeDetail';
import { TransitionDecisionControls } from './TransitionDecisionControls';
import { TransitionReviewPanel } from './TransitionReviewPanel';
import { WorkspaceAssistantPanel } from './WorkspaceAssistantPanel';
import styles from './WorkspaceAuthoringSurface.module.css';

const valueText = (value: unknown) =>
  value === undefined ? 'Absent' : JSON.stringify(value, null, 2);
const label = (action: WorkspaceAuthoringAction) =>
  action.channel === 'assistant'
    ? 'Assistant proposal'
    : action.channel === 'mcp'
      ? 'MCP update'
      : action.channel === 'import'
        ? 'Imported snapshot'
        : 'Manual edit';
function ChannelIcon({ channel }: { channel: WorkspaceAuthoringAction['channel'] }) {
  const Icon = channel === 'assistant' ? Sparkles : channel === 'mcp' ? Workflow : User;
  return <Icon aria-hidden="true" className="size-4" />;
}
export function DraftChangeCard({
  card,
  onInspect,
}: {
  card: WorkspaceAuthoringCard;
  onInspect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onInspect}
      className={`${styles.changeCard} group min-w-0 rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3 text-left transition-colors hover:border-[var(--text-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[11px] font-medium" title={card.path}>
          {card.path}
        </span>
        <History aria-hidden="true" className="size-3.5 shrink-0 text-[var(--text-secondary)]" />
      </div>
      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-start gap-2 text-xs">
        <pre className="max-h-20 overflow-hidden whitespace-pre-wrap break-all rounded bg-[var(--diff-removed-bg)] p-1.5 text-[var(--text-secondary)]">
          {valueText(card.before)}
        </pre>
        <ArrowRight aria-label="changes to" className="mt-2 size-3 text-[var(--text-secondary)]" />
        <pre className="max-h-20 overflow-hidden whitespace-pre-wrap break-all rounded bg-[var(--diff-added-bg)] p-1.5">
          {valueText(card.after)}
        </pre>
      </div>
      {card.beforePath && card.afterPath && card.beforePath !== card.afterPath ? (
        <p className="mt-2 truncate text-[10px] text-[var(--text-secondary)]">
          Moved from {card.beforePath}
        </p>
      ) : null}
    </button>
  );
}
export function WorkspaceAuthoringSurface({ candidate }: { candidate: WorkspaceCandidate }) {
  const materialUpload = useMaterialUpload();
  const [pastedSource, setPastedSource] = useState<string | null>(null);
  const authoring = useWorkspaceAuthoring(candidate.projectId, candidate.id);
  const { view } = authoring;
  const [expanded, setExpanded] = useState<string[]>([]);
  const [events, setEvents] = useState<WorkspaceAuthoringAction[]>([]);
  const [cards, setCards] = useState<Record<string, WorkspaceAuthoringCard[]>>({});
  const [olderCursor, setOlderCursor] = useState<number | null>(null);
  const [nodeRevision, setNodeRevision] = useState<number>();
  const [nodeOlderCursor, setNodeOlderCursor] = useState<number | null>(null);
  const [selected, setSelected] = useState<string>();
  const [scope, setScope] = useState<'events' | 'all' | 'review'>('events');
  const [panel, setPanel] = useState<'history' | 'chat' | null>(null);
  const [node, setNode] = useState<WorkspaceAuthoringView['node']>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [newPath, setNewPath] = useState('');
  const [creating, setCreating] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [posture, setPosture] = useState<WorkspaceProposalPosture>('source_only');
  const [pending, setPending] = useState<string[]>([]);
  const [review, setReview] = useState<TransitionControlPlaneView | null>(null);
  const [reviewCards, setReviewCards] = useState<WorkspaceAuthoringCard[]>([]);
  const [inspectedCard, setInspectedCard] = useState<WorkspaceAuthoringCard>();
  const [decision, setDecision] = useState<string>();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lastOwnRevision = useRef<number | undefined>(undefined);
  const saveIdentity = useRef<{ facts: string; id: string } | undefined>(undefined);
  const generationIdentity = useRef<{ facts: string; id: string } | undefined>(undefined);
  const publicationIds = useRef<Record<string, string>>({});
  const sourceSelection = view?.sources ?? candidate.sourceBundle;
  const sources = sourceSelection.flatMap((source) =>
    source.materialId ? [source.materialId] : []
  );
  const conversationId = sourceSelection.find((source) => source.conversationId)?.conversationId;
  useEffect(() => {
    if (!view || lastOwnRevision.current === view.workspaceRevision) return;
    lastOwnRevision.current = view.workspaceRevision;
    setEvents(view.actions);
    setOlderCursor(view.nextBeforeSequence);
    setExpanded(view.selected ? [view.selected.action.actionId] : []);
    setSelected(view.selected?.action.actionId);
    if (view.selected)
      setCards((current) => ({
        ...current,
        [view.selected!.action.actionId]: [...view.selected!.cards],
      }));
  }, [view]);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  async function inspect(card: WorkspaceAuthoringCard, actionId?: string) {
    if (edit !== null) {
      setError('Save or cancel the current edit before inspecting another node.');
      return;
    }
    const result = await authoring.read({ node_id: card.nodeId, action_id: actionId });
    setNode(result.node);
    setInspectedCard(card);
    setNodeRevision(result.workspaceRevision);
    setNodeOlderCursor(
      result.node?.entries.length === 20 ? result.node.entries.at(-1)!.sequence : null
    );
    setSelected(actionId);
    setPanel('history');
  }
  async function openAction(actionId: string, force = false) {
    if (expanded.includes(actionId) && !force) {
      setExpanded((current) => current.filter((id) => id !== actionId));
      return;
    }
    const result = await authoring.read({ action_id: actionId });
    setCards((current) => ({ ...current, [actionId]: result.selected?.cards ?? [] }));
    setExpanded((current) => [...new Set([...current, actionId])]);
    requestAnimationFrame(() =>
      document.getElementById(`action-${actionId}`)?.scrollIntoView({ block: 'nearest' })
    );
    setSelected(actionId);
    setScope('events');
  }
  async function save(remove = false) {
    if (!view) return;
    const path = creating ? newPath : node?.path;
    if (!path) throw new Error('Select a current node or enter a path');
    const operations = remove
      ? [{ unset: { path } }]
      : [{ set: { path, value: JSON.parse(edit ?? 'null') } }];
    const facts = JSON.stringify({ operations, workspaceRevision: view.workspaceRevision });
    if (saveIdentity.current?.facts !== facts)
      saveIdentity.current = { facts, id: crypto.randomUUID() };
    const outcome = await authoring.publish({
      request_id: saveIdentity.current.id,
      expected_revision: view.compositionRevision,
      expected_workspace_revision: view.workspaceRevision,
      expected_ref_head: view.basis.refHead,
      operations,
      reason: remove ? 'Remove current value' : 'Edit current value',
    });
    saveIdentity.current = undefined;
    setEdit(null);
    setCreating(false);
    setNode(null);
    setPanel((current) => (current === 'history' ? null : current));
    setNotice(
      outcome.kind === 'no_change'
        ? 'Already matches the current Draft; no action added.'
        : 'Saved as a new Draft action. Earlier history is unchanged.'
    );
    setReview(null);
    setScope('events');
  }
  async function attachDocument(file: File) {
    const material = await materialUpload.upload(candidate.projectId, file);
    await authoring.commands.attachSource({
      id: `material:${material.id}`,
      type: 'document',
      title: material.title,
      materialId: material.id,
      contentHash: material.content_hash,
    });
    setPastedSource(null);
    setNotice('Source added. It will be included in the next prepared context.');
  }
  async function generate() {
    if (!view) return;
    const sourceTurnHashes = conversationId
      ? (await authoring.commands.sourceUserTurns(conversationId)).turns
          .filter((turn) => turn.role === 'user')
          .map((turn) => turn.turn_hash)
      : [];
    if (conversationId)
      setNotice(
        'Proposal context uses original user turns from the latest 64 saved conversation messages, plus selected documents.'
      );
    const facts = JSON.stringify({
      sourceTurnHashes,
      instruction,
      posture,
      sources,
      revision: view.workspaceRevision,
    });
    if (generationIdentity.current?.facts !== facts)
      generationIdentity.current = { facts, id: crypto.randomUUID() };
    const result = await authoring.commands.generate({
      projectId: candidate.projectId,
      workspaceId: candidate.id,
      posture,
      instruction,
      sourceMaterialIds: sources,
      sourceTurnHashes,
      ifRevision: view.workspaceRevision,
      requestId: generationIdentity.current.id,
    });
    setPending((current) => [...new Set([...current, result.transition_id])]);
    generationIdentity.current = undefined;
    setNotice('Candidate generated. Publish it to append a Draft action.');
  }
  if (!view)
    return <output className="p-6 text-sm">{authoring.error ?? 'Loading Draft activity…'}</output>;
  const guarded = {
    expected_workspace_revision: view.workspaceRevision,
    expected_revision: view.compositionRevision,
    expected_ref_head: view.basis.refHead,
  };
  return (
    <div
      className={`${styles.surface} flex min-h-0 flex-1 flex-col overflow-hidden bg-white text-[var(--text-primary)]`}
    >
      <header
        className={`${styles.header} flex flex-wrap items-center justify-between gap-3 border-b border-[var(--stroke-divider)] px-5 py-3`}
      >
        <div>
          <h2 className="text-sm font-semibold">
            {candidate.title}{' '}
            <span className="ml-2 rounded bg-[var(--surface-card)] px-2 py-0.5 font-mono text-[10px]">
              DRAFT · r{view.compositionRevision}
            </span>
          </h2>
          <p className="mt-1 font-mono text-[10px] text-[var(--text-secondary)]">
            {view.basis.refName} · Base {view.basis.refHead?.slice(0, 16) ?? 'empty'}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void run(async () => {
                if (edit !== null)
                  throw new Error('Save or cancel your edit before switching to Latest');
                await authoring.load();
                setScope('events');
              })
            }
          >
            Latest action
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={scope === 'all'}
            onClick={() => setScope('all')}
          >
            All draft changes
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await authoring.commands.prepareReview({
                  ...guarded,
                  request_id: crypto.randomUUID(),
                  reason: 'Review complete Draft composition',
                });
                setReview(result.view);
                setDecision(undefined);
                setReviewCards(structuredClone(view.netDiff));
                setScope('review');
              })
            }
          >
            Review complete draft
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Toggle Chat"
            aria-pressed={panel === 'chat'}
            onClick={() => setPanel((current) => (current === 'chat' ? null : 'chat'))}
          >
            <MessageSquare className="size-4" />
          </Button>
        </div>
      </header>
      {authoring.newActivity ? (
        <div
          aria-live="polite"
          className="flex items-center justify-between border-b border-[var(--diff-modified-border)] bg-[var(--diff-modified-bg)] px-5 py-2 text-xs"
        >
          <span>
            New activity · r{authoring.newActivity.compositionRevision}. Your inspected action and
            unsaved input are preserved.
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void run(async () => {
                if (edit !== null)
                  throw new Error(
                    'Your edit is based on an older revision. Cancel it to load the current value.'
                  );
                await authoring.load();
              })
            }
          >
            Load latest
          </Button>
        </div>
      ) : null}
      {error || notice ? (
        <p
          role={error ? 'alert' : 'status'}
          className={`border-b border-[var(--stroke-divider)] px-5 py-2 text-xs ${error ? 'text-[var(--diff-removed-text)]' : 'text-[var(--text-secondary)]'}`}
        >
          {error ?? notice}
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className={`${styles.main} min-h-0 min-w-0 flex-1 overflow-auto p-5`}>
          {scope === 'review' && review ? (
            <div className="space-y-4">
              <p className="text-xs text-[var(--text-secondary)]">
                Complete Draft snapshot · workspace revision{' '}
                {review.precondition.workspace_revision}. Its immutable authoring history remains
                available in Compose.
              </p>
              <section aria-label="Reviewed Draft changes">
                <h3 className="mb-2 text-xs font-medium">
                  Frozen Base → Draft changes · {reviewCards.length} nodes
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {reviewCards.map((card) => (
                    <DraftChangeCard
                      key={card.nodeId}
                      card={card}
                      onInspect={() => void run(() => inspect(card))}
                    />
                  ))}
                </div>
              </section>
              <TransitionReviewPanel view={review.transition} error={null} loading={busy} />
              <TransitionDecisionControls
                busy={busy}
                view={review.transition}
                overrideReason={reason}
                onOverrideReasonChange={setReason}
                onDecide={(outcome, rationale) =>
                  void run(async () => {
                    if (!review.precondition.policy_digest)
                      throw new Error('Configure a ref policy before deciding');
                    const result = await authoring.commands.decide(review.transition_id, {
                      request_id: crypto.randomUUID(),
                      outcome,
                      rationale,
                      precondition: {
                        ...review.precondition,
                        policy_digest: review.precondition.policy_digest,
                      },
                    });
                    setReview(result.view);
                    setDecision(result.decision_digest);
                  })
                }
              />
              {decision ? (
                <Button
                  disabled={
                    busy ||
                    review.transition.decision.observation !== 'supplied' ||
                    review.transition.decision.outcome === 'rejected'
                  }
                  onClick={() =>
                    void run(async () => {
                      const result = await authoring.commands.commit(review.transition_id, {
                        request_id: crypto.randomUUID(),
                        decision_digest: decision,
                        expected_head: view.basis.refHead,
                      });
                      setNotice(
                        `Committed ${result.commit_digest}. Draft activity remains available for audit.`
                      );
                    })
                  }
                >
                  Commit reviewed Draft
                </Button>
              ) : null}
            </div>
          ) : scope === 'all' ? (
            <section aria-label="All draft changes">
              <h3 className="mb-3 text-xs font-medium text-[var(--text-secondary)]">
                Base → current · {view.netDiff.length} changed nodes
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {view.netDiff.map((card) => (
                  <DraftChangeCard
                    key={card.nodeId}
                    card={card}
                    onInspect={() => void run(() => inspect(card))}
                  />
                ))}
              </div>
              {view.netDiff.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">
                  Current values match Base. Published action history is retained.
                </p>
              ) : null}
            </section>
          ) : (
            <div className="space-y-4">
              {events.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--stroke-divider)] p-6">
                  <h3 className="text-sm font-medium">A clean Draft</h3>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Add a change, publish a proposal, or use T3X MCP. Each successful operation
                    appears here.
                  </p>
                </div>
              ) : null}
              {events.map((action, index) => (
                <section
                  id={`action-${action.actionId}`}
                  key={action.actionId}
                  className="rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-card)]/30"
                  aria-label={`Action ${action.sequence}: ${label(action)}`}
                >
                  <button
                    type="button"
                    aria-expanded={expanded.includes(action.actionId)}
                    className="flex w-full items-center gap-3 p-3 text-left"
                    onClick={() => void run(() => openAction(action.actionId))}
                  >
                    <span
                      className={`rounded-md p-2 ${index === 0 ? 'bg-[var(--accent-conversation-soft)] text-[var(--accent-conversation)]' : 'bg-[var(--surface-card)] text-[var(--text-secondary)]'}`}
                    >
                      <ChannelIcon channel={action.channel} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-xs font-semibold">
                        {label(action)}{' '}
                        <span className="ml-2 font-mono font-normal text-[var(--text-secondary)]">
                          #{action.sequence}
                        </span>
                      </span>
                      <span className="mt-1 block truncate text-[10px] text-[var(--text-secondary)]">
                        {action.actor.id} · {new Date(action.publishedAt).toLocaleString()} ·{' '}
                        {action.affectedNodeCount ?? 0} nodes
                      </span>
                    </span>
                    {index === 0 ? (
                      <span className="rounded-full border border-[var(--accent-conversation)]/25 px-2 py-0.5 text-[9px] font-semibold text-[var(--accent-conversation)]">
                        LATEST
                      </span>
                    ) : null}
                    {expanded.includes(action.actionId) ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                  </button>
                  {expanded.includes(action.actionId) ? (
                    <div className="border-t border-[var(--stroke-divider)] p-3">
                      <p className="mb-3 text-[11px] text-[var(--text-secondary)]">
                        {action.reason ?? 'Saved current-state changes'} · r{action.beforeRevision}{' '}
                        → r{action.afterRevision}
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {(cards[action.actionId] ?? []).map((card) => (
                          <DraftChangeCard
                            key={card.nodeId}
                            card={card}
                            onInspect={() => void run(() => inspect(card, action.actionId))}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>
              ))}
              {events.length && olderCursor ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void run(async () => {
                      const next = await authoring.read({
                        before_sequence: olderCursor,
                      });
                      setOlderCursor(next.nextBeforeSequence);
                      setEvents((current) => [
                        ...current,
                        ...next.actions.filter(
                          (action) => !current.some((old) => old.actionId === action.actionId)
                        ),
                      ]);
                    })
                  }
                >
                  Load older actions
                </Button>
              ) : null}
            </div>
          )}
        </main>
        {
          <aside
            className={`${styles.sidePanel} ${panel ? 'flex' : 'hidden'} min-h-0 max-h-[55vh] w-full shrink-0 flex-col lg:max-h-none border-t border-[var(--stroke-divider)] lg:w-96 lg:border-t-0 lg:border-l`}
          >
            <div className="flex items-center justify-between border-b border-[var(--stroke-divider)] px-4 py-2">
              <span className="text-[11px] font-semibold">
                {panel === 'chat' ? 'CONVERSATION' : 'NODE HISTORY'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Close side panel"
                onClick={() => setPanel(null)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className={panel === 'chat' ? 'flex min-h-0 flex-1' : 'hidden'}>
              <WorkspaceAssistantPanel
                projectId={candidate.projectId}
                onCreateConversation={async () => {
                  const conversation = await authoring.commands.createConversation();
                  await authoring.commands.attachSource({
                    id: `chat:${conversation.conversation_id}`,
                    type: 'chat',
                    title: 'Workspace source thread',
                    conversationId: conversation.conversation_id,
                  });
                  return conversation.conversation_id;
                }}
                conversationId={conversationId}
                context={{
                  workspaceId: candidate.id,
                  workspaceRevision: view.workspaceRevision,
                  sourceMaterialIds: sources,
                  selectedActionId: selected,
                  selectedNodeId: node?.nodeId,
                  posture,
                  onCandidate: (transitionId) =>
                    setPending((current) => [...new Set([...current, transitionId])]),
                }}
              />
            </div>
            {panel === 'history' && node ? (
              <div className="space-y-4 overflow-auto p-4">
                <p className="break-all font-mono text-xs">{node.path ?? node.nodeId}</p>
                {inspectedCard ? <DraftNodeChangeDetail card={inspectedCard} /> : null}
                <div className="rounded-lg border border-[var(--stroke-divider)] p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase text-[var(--text-secondary)]">
                    Current value · workspace r{nodeRevision} · {node.state}
                  </p>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-xs">
                    {valueText(node.current)}
                  </pre>
                  {node.state === 'present' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      disabled={nodeRevision !== view.workspaceRevision}
                      onClick={() => {
                        setCreating(false);
                        setEdit(valueText(node.current));
                      }}
                    >
                      Edit current value
                    </Button>
                  ) : null}
                </div>
                {node.entries.map((entry) => (
                  <div
                    key={entry.actionId}
                    className={`border-l-2 pl-3 ${entry.actionId === selected ? 'border-[var(--accent-conversation)]' : 'border-[var(--stroke-divider)]'}`}
                  >
                    <button
                      type="button"
                      className="text-left text-xs font-medium"
                      onClick={() => void run(() => openAction(entry.actionId, true))}
                    >
                      #{entry.sequence} · {entry.channel}
                      {entry.isSelected ? ' · Inspected action' : ''}
                    </button>
                    <p className="mt-1 text-[10px] text-[var(--text-secondary)]">
                      {entry.actor.id} · {new Date(entry.publishedAt).toLocaleString()}
                    </p>
                    <pre className="my-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-xs">
                      {valueText(entry.before)} → {valueText(entry.after)}
                    </pre>
                  </div>
                ))}
                {nodeOlderCursor !== null ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void run(async () => {
                        const page = await authoring.read({
                          node_id: node.nodeId,
                          action_id: selected,
                          before_sequence: nodeOlderCursor,
                        });
                        setNodeOlderCursor(
                          page.node?.entries.length === 20
                            ? page.node.entries.at(-1)!.sequence
                            : null
                        );
                        setNode((current) =>
                          current && page.node
                            ? { ...current, entries: [...current.entries, ...page.node.entries] }
                            : current
                        );
                      })
                    }
                  >
                    Older node history
                  </Button>
                ) : null}
              </div>
            ) : null}
          </aside>
        }
      </div>
      {edit !== null ? (
        <section
          aria-label="Edit current Draft"
          className="space-y-2 border-t border-[var(--stroke-divider)] p-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">
              {creating ? 'Add current value' : 'Edit current value'} · appends a new action
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEdit(null);
                setCreating(false);
              }}
            >
              Cancel
            </Button>
          </div>
          {creating ? (
            <input
              className="w-full rounded border border-[var(--stroke-divider)] bg-transparent p-2 text-xs"
              aria-label="New value path"
              placeholder="e.g. prd/audience"
              value={newPath}
              onChange={(event) => setNewPath(event.target.value)}
            />
          ) : null}
          <Textarea
            aria-label="Current value as JSON"
            value={edit}
            onChange={(event) => setEdit(event.target.value)}
            className="font-mono text-xs"
          />
          <div className="flex justify-end gap-2">
            {!creating ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void run(() => save(true))}
              >
                Remove current value
              </Button>
            ) : null}
            <Button size="sm" disabled={busy} onClick={() => void run(() => save())}>
              Save new action
            </Button>
          </div>
        </section>
      ) : null}
      <section
        aria-label="Selected sources"
        className="border-t border-[var(--stroke-divider)] px-5 py-2 text-xs"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[var(--text-secondary)]">Sources</span>
          {sourceSelection.map((source) => (
            <span
              key={source.id}
              className="rounded border border-[var(--stroke-divider)] px-2 py-1"
            >
              {source.title ?? source.id}
            </span>
          ))}
          <label className="cursor-pointer rounded border border-[var(--stroke-divider)] px-2 py-1">
            Attach document
            <input
              aria-label="Attach source document"
              type="file"
              className="sr-only"
              disabled={busy || edit !== null}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void run(() => attachDocument(file));
              }}
            />
          </label>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || edit !== null}
            onClick={() => setPastedSource('')}
          >
            Paste source
          </Button>
        </div>
        {pastedSource !== null ? (
          <div className="mt-2 flex gap-2">
            <Textarea
              aria-label="Source text"
              value={pastedSource}
              onChange={(event) => setPastedSource(event.target.value)}
            />
            <Button
              size="sm"
              disabled={busy || !pastedSource.trim()}
              onClick={() =>
                void run(() =>
                  attachDocument(
                    new File([pastedSource], 'source-note.txt', { type: 'text/plain' })
                  )
                )
              }
            >
              Add source
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPastedSource(null)}>
              Cancel
            </Button>
          </div>
        ) : null}
      </section>
      <footer
        className={`${styles.footer} space-y-3 border-t border-[var(--stroke-divider)] bg-[var(--surface-card)] px-5 py-3`}
      >
        {[
          ...new Set([
            ...pending,
            ...(view.pendingCandidates ?? []).map((item) => item.transitionId),
          ]),
        ].map((transitionId) => (
          <div
            key={transitionId}
            className="flex items-center justify-between gap-3 rounded-lg border border-[var(--accent-conversation)]/20 bg-[var(--accent-conversation-soft)] px-3 py-2"
          >
            <span className="truncate text-xs">
              {view.pendingCandidates?.find((item) => item.transitionId === transitionId)
                ?.status === 'stale'
                ? 'Stale candidate — generate again against the current Draft'
                : 'Unpublished candidate'}{' '}
              · {transitionId.slice(-12)}
            </span>
            <Button
              size="sm"
              disabled={
                busy ||
                view.pendingCandidates?.some(
                  (item) => item.transitionId === transitionId && item.status === 'stale'
                )
              }
              onClick={() =>
                void run(async () => {
                  publicationIds.current[transitionId] ??= crypto.randomUUID();
                  await authoring.commands.publishCandidate(transitionId, {
                    request_id: publicationIds.current[transitionId],
                  });
                  await authoring.load();
                  setPending((current) => current.filter((id) => id !== transitionId));
                  setReview(null);
                  setScope('events');
                })
              }
            >
              Publish to Draft
            </Button>
          </div>
        ))}
        {view.candidateWindowTruncated ? (
          <p className="text-xs text-[var(--text-secondary)]">
            Showing candidates from the latest 100 proposal records.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setCreating(true);
              setEdit('null');
              setNewPath('');
            }}
          >
            <Plus className="mr-1 size-3" />
            Add change
          </Button>
          <input
            aria-label="Proposal instruction"
            placeholder="Describe the next change…"
            className="min-w-40 flex-1 rounded-md border border-[var(--stroke-divider)] bg-transparent px-3 py-2 text-xs"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
          />
          <select
            aria-label="Proposal posture"
            className="rounded-md border border-[var(--stroke-divider)] bg-transparent p-2 text-xs"
            value={posture}
            onChange={(event) => setPosture(event.target.value as WorkspaceProposalPosture)}
          >
            <option value="source_only">Source only</option>
            <option value="guided">Guided</option>
            <option value="recommend">Recommend</option>
          </select>
          <Button
            size="sm"
            disabled={busy || !instruction.trim()}
            onClick={() => void run(generate)}
          >
            <Sparkles className="mr-2 size-3" />
            Generate proposal
          </Button>
        </div>
      </footer>
    </div>
  );
}
