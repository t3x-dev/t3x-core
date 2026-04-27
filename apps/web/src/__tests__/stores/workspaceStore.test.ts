import type { SemanticContent, Source, SourcedYOp } from '@t3x-dev/core';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DRAFT_PERSISTENCE_CAP,
  selectPanelExpanded,
  useWorkspaceStore,
} from '@/store/workspaceStore';

describe('workspaceStore (state-only)', () => {
  beforeEach(() => {
    // Wipe both conversation state and ALL persisted maps so tests can't
    // leak panelExpanded / draftsByConversation entries into each other.
    useWorkspaceStore.getState().reset();
    useWorkspaceStore.setState({
      panelExpandedByProject: {},
      activeProjectId: null,
      draftsByConversation: {},
    });
  });

  it('starts in idle mode with empty derived state', () => {
    const s = useWorkspaceStore.getState();
    expect(s.mode).toBe('idle');
    expect(s.turns).toEqual([]);
    expect(s.opsLog).toEqual([]);
    expect(s.tree.trees).toEqual([]);
    expect(s.sourceIndex.size).toBe(0);
    expect(s.conversationId).toBeNull();
  });

  it('setConversation updates conversation id', () => {
    useWorkspaceStore.getState().setConversation('conv_abc');
    expect(useWorkspaceStore.getState().conversationId).toBe('conv_abc');
  });

  it('setTurns replaces turns array', () => {
    const turns = [{ turn_hash: 'sha256:t1', content: 'hi' }];
    useWorkspaceStore.getState().setTurns(turns);
    expect(useWorkspaceStore.getState().turns).toEqual(turns);
  });

  it('setDerived stores tree + sourceIndex + opsLog', () => {
    const tree: SemanticContent = {
      trees: [{ key: 'trip', slots: { dest: 'HZ' }, children: [] }],
      relations: [],
    };
    const sourceIndex = new Map<string, Source>([
      ['trip/dest', { type: 'human', author: 'ethan', at: '2026-04-12T00:00:00Z' }],
    ]);
    const op: SourcedYOp = {
      set: { path: 'trip/dest', value: 'HZ' },
      source: { type: 'human', author: 'ethan', at: '2026-04-12T00:00:00Z' },
    } as SourcedYOp;

    useWorkspaceStore.getState().setDerived({ tree, sourceIndex, opsLog: [op] });

    const s = useWorkspaceStore.getState();
    expect(s.tree.trees).toHaveLength(1);
    expect(s.sourceIndex.get('trip/dest')?.type).toBe('human');
    expect(s.opsLog).toHaveLength(1);
  });

  it('select + clearSelection manages UI selection', () => {
    useWorkspaceStore
      .getState()
      .select('after', { nodePath: 'trip', slotKey: 'budget', turnIndex: 3 });
    const s = useWorkspaceStore.getState();
    expect(s.selectedNodePath).toBe('trip');
    expect(s.selectedSlotKey).toBe('budget');
    expect(s.selectedTurnIndex).toBe(3);
    expect(s.selectedSource).toBe('after');

    useWorkspaceStore.getState().clearSelection();
    expect(useWorkspaceStore.getState().selectedNodePath).toBeNull();
    expect(useWorkspaceStore.getState().selectedSource).toBeNull();
  });

  it('mode and flags flow through their setters', () => {
    useWorkspaceStore.getState().setMode('streaming');
    expect(useWorkspaceStore.getState().mode).toBe('streaming');

    useWorkspaceStore.getState().setActiveProject('proj_x');
    useWorkspaceStore.getState().setPanelExpanded(true);
    expect(selectPanelExpanded(useWorkspaceStore.getState())).toBe(true);

    useWorkspaceStore.getState().setCommitted(true);
    expect(useWorkspaceStore.getState().isCommitted).toBe(true);

    useWorkspaceStore.getState().setError('boom');
    expect(useWorkspaceStore.getState().lastError).toBe('boom');
  });

  it('reset clears conversation data but preserves UI prefs', () => {
    useWorkspaceStore.getState().setActiveProject('proj_y');
    useWorkspaceStore.getState().setPanelExpanded(true);
    useWorkspaceStore.getState().setConversation('conv_abc');
    useWorkspaceStore.getState().setMode('streaming');
    useWorkspaceStore.getState().setError('boom');

    useWorkspaceStore.getState().reset();

    const s = useWorkspaceStore.getState();
    expect(s.conversationId).toBeNull();
    expect(s.mode).toBe('idle');
    expect(s.lastError).toBeNull();
    // Per-project pref + active project survive a conversation reset so
    // navigating between conversations of the same project doesn't slam the
    // workspace shut.
    expect(s.activeProjectId).toBe('proj_y');
    expect(selectPanelExpanded(s)).toBe(true);
  });

  it('setPanelExpanded is per-project; switching projects defaults to folded', () => {
    useWorkspaceStore.getState().setActiveProject('proj_a');
    useWorkspaceStore.getState().setPanelExpanded(true);
    expect(selectPanelExpanded(useWorkspaceStore.getState())).toBe(true);

    // Switching to a brand-new project starts folded — the pref is per-project,
    // not global.
    useWorkspaceStore.getState().setActiveProject('proj_b');
    expect(selectPanelExpanded(useWorkspaceStore.getState())).toBe(false);

    // Coming back to proj_a restores the previous expanded state.
    useWorkspaceStore.getState().setActiveProject('proj_a');
    expect(selectPanelExpanded(useWorkspaceStore.getState())).toBe(true);
  });

  it('setDraft populates ops/tree and flips hasDraft; clearDraft resets all three', () => {
    const previewTree: SemanticContent = {
      trees: [{ key: 'trip', slots: { dest: 'HZ' }, children: [] }],
      relations: [],
    };
    const draftOps = [
      {
        set: { path: 'trip/dest', value: 'HZ' },
        source: {
          type: 'llm' as const,
          model: 'gpt-4o-mini',
          at: '2026-04-26T00:00:00Z',
          turn_ref: { turn_hash: 'sha256:t1', quote: 'HZ' },
        },
      },
    ];

    useWorkspaceStore.getState().setDraft({ ops: draftOps as never, tree: previewTree });
    let s = useWorkspaceStore.getState();
    expect(s.draftOps).toEqual(draftOps);
    expect(s.draftTree).toEqual(previewTree);
    expect(s.hasDraft).toBe(true);

    useWorkspaceStore.getState().clearDraft();
    s = useWorkspaceStore.getState();
    expect(s.draftOps).toEqual([]);
    expect(s.draftTree).toBeNull();
    expect(s.hasDraft).toBe(false);
  });

  it('setDraft with empty ops leaves hasDraft false (avoids stale-draft button state)', () => {
    // An extraction that returned zero ops is not a draft worth applying;
    // hasDraft must stay false so Apply remains disabled.
    useWorkspaceStore.getState().setDraft({ ops: [], tree: { trees: [], relations: [] } });
    expect(useWorkspaceStore.getState().hasDraft).toBe(false);
  });

  it('discard sequence (clearDraft + setScriptText empty + setScriptDirty false) fully releases Apply', () => {
    // P2 regression: AfterPanel's Discard previously only called
    // hydrateConversationToStore — that left draftOps / hasDraft /
    // scriptText / scriptDirty intact, so the user could click Apply on
    // a draft they thought was discarded. The fix is to call all three
    // primitives in sequence; this test verifies that the resulting
    // state actually disables Apply (canRun gates on
    // scriptDirty || hasDraft).
    useWorkspaceStore.getState().setDraft({
      ops: [
        {
          set: { path: 'trip/dest', value: 'HZ' },
          source: {
            type: 'llm' as const,
            model: 'gpt-4o-mini',
            at: '2026-04-26T00:00:00Z',
            turn_ref: { turn_hash: 'sha256:t1', quote: 'HZ' },
          },
        },
      ] as never,
      tree: { trees: [], relations: [] },
    });
    useWorkspaceStore.getState().setScriptText('yops:\n  - set: ...');
    useWorkspaceStore.getState().setScriptDirty(true);

    // Discard sequence (must mirror AfterPanel.handleDiscard):
    useWorkspaceStore.getState().clearDraft();
    useWorkspaceStore.getState().setScriptText('');
    useWorkspaceStore.getState().setScriptDirty(false);

    const s = useWorkspaceStore.getState();
    expect(s.hasDraft).toBe(false);
    expect(s.draftOps).toEqual([]);
    expect(s.draftTree).toBeNull();
    expect(s.scriptText).toBe('');
    expect(s.scriptDirty).toBe(false);
  });

  it('reset clears the draft along with other conversation-scoped state', () => {
    useWorkspaceStore.getState().setDraft({
      ops: [
        {
          set: { path: 'trip/dest', value: 'HZ' },
          source: {
            type: 'llm' as const,
            model: 'gpt-4o-mini',
            at: '2026-04-26T00:00:00Z',
            turn_ref: { turn_hash: 'sha256:t1', quote: 'HZ' },
          },
        },
      ] as never,
      tree: { trees: [], relations: [] },
    });
    expect(useWorkspaceStore.getState().hasDraft).toBe(true);

    useWorkspaceStore.getState().reset();

    const s = useWorkspaceStore.getState();
    expect(s.hasDraft).toBe(false);
    expect(s.draftOps).toEqual([]);
    expect(s.draftTree).toBeNull();
  });

  describe('setPanelExpanded — pending intent for cold-load races (PR-C P1)', () => {
    // The previous behaviour silently early-returned when no project was
    // active, dropping clicks issued during the brief window between
    // /chat/:id mount and the async meta backfill that resolves
    // project_id. Now the intent is captured in `pendingPanelExpanded`
    // (ephemeral, not persisted) and promoted by the next
    // `setActiveProject(projectId)` call.

    it('captures the click as a pending intent when activeProjectId is null', () => {
      useWorkspaceStore.getState().setPanelExpanded(true);
      const s = useWorkspaceStore.getState();
      // Persisted map must stay clean — we don't write to a "default"
      // key (would pollute and leak across projects).
      expect(s.panelExpandedByProject).toEqual({});
      // Selector still reads false until a project is known.
      expect(selectPanelExpanded(s)).toBe(false);
      // But the intent is held for the project that will resolve next.
      expect(s.pendingPanelExpanded).toBe(true);
    });

    it('promotes the pending intent on the next setActiveProject', () => {
      // Real-world flow: user clicks Workspace → useChatInit's async
      // fetchConversationMeta completes → page useEffect calls
      // setActiveProject(projectId) → panel expands.
      useWorkspaceStore.getState().setPanelExpanded(true);
      useWorkspaceStore.getState().setActiveProject('proj_late');

      const s = useWorkspaceStore.getState();
      expect(s.activeProjectId).toBe('proj_late');
      expect(s.panelExpandedByProject).toEqual({ proj_late: true });
      expect(s.pendingPanelExpanded).toBeNull();
      expect(selectPanelExpanded(s)).toBe(true);
    });

    it('cross-conversation guard: setConversation to a different convId clears pending', () => {
      // User clicks Workspace on conv_A (no project yet), then navigates
      // to conv_B before conv_A's project resolves. The pending intent
      // must NOT leak onto conv_B's project — that would expand a panel
      // for a conversation the user never clicked Workspace on.
      useWorkspaceStore.getState().setConversation('conv_A');
      useWorkspaceStore.getState().setPanelExpanded(true);
      expect(useWorkspaceStore.getState().pendingPanelExpanded).toBe(true);

      useWorkspaceStore.getState().setConversation('conv_B');
      expect(useWorkspaceStore.getState().pendingPanelExpanded).toBeNull();

      // setActiveProject after switch must NOT find a pending to apply.
      useWorkspaceStore.getState().setActiveProject('proj_B');
      expect(useWorkspaceStore.getState().panelExpandedByProject).toEqual({});
    });

    it('same-conv re-set of conversationId does NOT clear pending (chatInit re-fire)', () => {
      // useChatInit re-runs its effect when `resolvedProjectId`
      // changes; that path calls `setConversation(convId)` with the
      // same id. Clearing pending there would lose the click that was
      // captured between mount and project backfill — the very click
      // we're trying to apply.
      useWorkspaceStore.getState().setConversation('conv_A');
      useWorkspaceStore.getState().setPanelExpanded(true);
      useWorkspaceStore.getState().setConversation('conv_A');
      expect(useWorkspaceStore.getState().pendingPanelExpanded).toBe(true);
    });

    it('writes directly to the persisted map when a project is already active', () => {
      // Steady-state: Workspace tab clicked after the project has
      // resolved. The pending field never enters the picture.
      useWorkspaceStore.getState().setActiveProject('proj_X');
      useWorkspaceStore.getState().setPanelExpanded(true);

      const s = useWorkspaceStore.getState();
      expect(s.panelExpandedByProject).toEqual({ proj_X: true });
      expect(s.pendingPanelExpanded).toBeNull();
    });
  });

  describe('setProjectPanelExpansion — direct writer for hydrate-time auto-expand (PR-C P2)', () => {
    // Used by hydrateConversationToStore so the auto-expand decision
    // can target a known projectId without depending on whether
    // setActiveProject has run yet. Tests that drive this directly
    // also use it to seed an explicit "false" preference.

    it('writes to the per-project map without consulting activeProjectId', () => {
      // No setActiveProject — direct writer must work regardless.
      useWorkspaceStore.getState().setProjectPanelExpansion('proj_direct', true);
      expect(useWorkspaceStore.getState().panelExpandedByProject).toEqual({
        proj_direct: true,
      });
    });

    it('preserves an explicit false preference: hydrate-time auto-expand must NOT override it', () => {
      // Critical for the discoverability rule. If the user has folded
      // the panel for `proj_X` once, every subsequent conversation in
      // that project (no matter how content-rich) must respect that
      // choice. The hydrate path checks `(projectId in panelExpandedByProject)`
      // — explicit false is "in", auto-expand is skipped.
      useWorkspaceStore.getState().setProjectPanelExpansion('proj_X', false);
      const s = useWorkspaceStore.getState();
      expect('proj_X' in s.panelExpandedByProject).toBe(true);
      // Selector reads the explicit false — not the absence of a
      // preference. This is the load-bearing distinction.
      useWorkspaceStore.getState().setActiveProject('proj_X');
      expect(selectPanelExpanded(useWorkspaceStore.getState())).toBe(false);
    });
  });

  describe('retainedDraftFailure (PR-B preserve-draft-on-failure)', () => {
    // The structured marker that survives a failed re-extract on top of a
    // previously-staged draft. Set by useExtraction's catch block; cleared
    // by the next successful extract / Discard / successful Apply / reset.
    // See `RetainedDraftFailure` in workspaceStore.ts.
    const failure = {
      message: 'Extraction could not verify 1 slot(s) against the conversation.',
      at: '2026-04-27T00:00:00Z',
      provider: 'openai',
      model: 'gpt-5.4-mini',
      preset: 'concise' as const,
    };

    it('starts null and survives setError so the two surfaces stay independent', () => {
      // Two distinct error fields drive two distinct UI surfaces. Setting
      // one must not silently clobber the other — useExtraction picks the
      // right field based on whether a draft was staged at attempt start.
      expect(useWorkspaceStore.getState().retainedDraftFailure).toBeNull();
      useWorkspaceStore.getState().setError('separate channel');
      expect(useWorkspaceStore.getState().retainedDraftFailure).toBeNull();
    });

    it('a successful new draft clears any retained failure marker', () => {
      // Real flow: Extract A succeeds → user has draft → Extract B fails
      // (sets retainedDraftFailure) → Extract C succeeds. After C, the
      // panel must flip back to "Draft preview" — retainedDraftFailure
      // describes a stale event by then.
      useWorkspaceStore.getState().setRetainedDraftFailure(failure);
      expect(useWorkspaceStore.getState().retainedDraftFailure).not.toBeNull();

      useWorkspaceStore.getState().setDraft({
        ops: [
          {
            set: { path: 'trip/dest', value: 'HZ' },
            source: {
              type: 'llm' as const,
              model: 'gpt-4o-mini',
              at: '2026-04-26T00:00:00Z',
              turn_ref: { turn_hash: 'sha256:t1', quote: 'HZ' },
            },
          },
        ] as never,
        tree: { trees: [], relations: [] },
      });
      expect(useWorkspaceStore.getState().retainedDraftFailure).toBeNull();
    });

    it('clearDraft (Discard / successful Apply) also clears the failure marker', () => {
      // Discard explicitly drops the proposal — the marker referred to
      // that draft, so it must clear too. Same path is used after a
      // successful Apply (useScriptExecution.execute). Without this the
      // panel would keep showing "Last extract failed... Previous draft
      // retained." after the user has already disposed of the draft.
      useWorkspaceStore.getState().setDraft({
        ops: [
          {
            set: { path: 'trip/dest', value: 'HZ' },
            source: {
              type: 'llm' as const,
              model: 'gpt-4o-mini',
              at: '2026-04-26T00:00:00Z',
              turn_ref: { turn_hash: 'sha256:t1', quote: 'HZ' },
            },
          },
        ] as never,
        tree: { trees: [], relations: [] },
      });
      useWorkspaceStore.getState().setRetainedDraftFailure(failure);
      expect(useWorkspaceStore.getState().retainedDraftFailure).not.toBeNull();

      useWorkspaceStore.getState().clearDraft();
      expect(useWorkspaceStore.getState().retainedDraftFailure).toBeNull();
    });

    it('reset() clears the marker as part of conversation-scoped wipe', () => {
      useWorkspaceStore.getState().setRetainedDraftFailure(failure);
      useWorkspaceStore.getState().reset();
      expect(useWorkspaceStore.getState().retainedDraftFailure).toBeNull();
    });
  });

  describe('per-conversation draft persistence', () => {
    const draftOps = [
      {
        set: { path: 'trip/dest', value: 'HZ' },
        source: {
          type: 'llm' as const,
          model: 'gpt-4o-mini',
          at: '2026-04-26T00:00:00Z',
          turn_ref: { turn_hash: 'sha256:t1', quote: 'HZ' },
        },
      },
    ];
    const previewTree: SemanticContent = {
      trees: [{ key: 'trip', slots: { dest: 'HZ' }, children: [] }],
      relations: [],
    };

    it('setDraft writes to draftsByConversation when a conversation is active', () => {
      useWorkspaceStore.getState().setConversation('conv_a');
      useWorkspaceStore.getState().setScriptText('yops:\n  - set: ...');
      useWorkspaceStore.getState().setDraft({ ops: draftOps as never, tree: previewTree });

      const map = useWorkspaceStore.getState().draftsByConversation;
      expect(map.conv_a).toBeDefined();
      expect(map.conv_a.ops).toEqual(draftOps);
      expect(map.conv_a.scriptText).toBe('yops:\n  - set: ...');
      expect(map.conv_a.scriptDirty).toBe(false);
    });

    it('setDraft does not write to the map without a conversationId (no key to use)', () => {
      // conversationId is null at this point — beforeEach wipes everything.
      useWorkspaceStore.getState().setDraft({ ops: draftOps as never, tree: previewTree });
      expect(useWorkspaceStore.getState().draftsByConversation).toEqual({});
    });

    it('setScriptText / setScriptDirty mirror to the map only while a draft is staged', () => {
      useWorkspaceStore.getState().setConversation('conv_a');
      // No draft yet → setScriptText writes only the in-memory field.
      useWorkspaceStore.getState().setScriptText('orphan edit');
      expect(useWorkspaceStore.getState().draftsByConversation).toEqual({});

      // Stage a draft, then edit the script. Both writes should be
      // captured in the persisted snapshot so an F5 restores the latest
      // edited form, not the original LLM proposal.
      useWorkspaceStore.getState().setDraft({ ops: draftOps as never, tree: previewTree });
      useWorkspaceStore.getState().setScriptText('user edited the proposal');
      useWorkspaceStore.getState().setScriptDirty(true);

      const snapshot = useWorkspaceStore.getState().draftsByConversation.conv_a;
      expect(snapshot.scriptText).toBe('user edited the proposal');
      expect(snapshot.scriptDirty).toBe(true);
    });

    it('clearDraft removes the entry for the current conversation', () => {
      useWorkspaceStore.getState().setConversation('conv_a');
      useWorkspaceStore.getState().setDraft({ ops: draftOps as never, tree: previewTree });
      expect(useWorkspaceStore.getState().draftsByConversation.conv_a).toBeDefined();

      useWorkspaceStore.getState().clearDraft();
      expect(useWorkspaceStore.getState().draftsByConversation.conv_a).toBeUndefined();
    });

    it('reset() preserves the persisted map (per-conversation drafts survive nav)', () => {
      // Stage drafts on two conversations, then reset. The conversation
      // we just navigated AWAY from must keep its persisted draft so
      // navigating back restores it.
      useWorkspaceStore.getState().setConversation('conv_a');
      useWorkspaceStore.getState().setDraft({ ops: draftOps as never, tree: previewTree });
      useWorkspaceStore.getState().setConversation('conv_b');
      useWorkspaceStore.getState().setDraft({
        ops: [
          {
            set: { path: 'other', value: 'val' },
            source: {
              type: 'llm' as const,
              model: 'gpt-4o-mini',
              at: '2026-04-26T00:00:00Z',
              turn_ref: { turn_hash: 'sha256:t2', quote: 'val' },
            },
          },
        ] as never,
        tree: { trees: [], relations: [] },
      });

      useWorkspaceStore.getState().reset();

      // Conversation-scoped state cleared, but the persisted map survives.
      expect(useWorkspaceStore.getState().hasDraft).toBe(false);
      expect(useWorkspaceStore.getState().draftOps).toEqual([]);
      expect(Object.keys(useWorkspaceStore.getState().draftsByConversation)).toEqual(
        expect.arrayContaining(['conv_a', 'conv_b'])
      );
    });

    it('restoreDraftFor returns false and is a no-op when no snapshot exists', () => {
      const before = useWorkspaceStore.getState();
      const result = useWorkspaceStore.getState().restoreDraftFor('conv_unknown');
      expect(result).toBe(false);
      const after = useWorkspaceStore.getState();
      expect(after.hasDraft).toBe(before.hasDraft);
      expect(after.draftOps).toBe(before.draftOps);
      expect(after.scriptText).toBe(before.scriptText);
    });

    it('restoreDraftFor restores ops + script + dirty + re-derives draftTree against current tree', () => {
      // Pretend a previous session staged a draft on conv_a, then the
      // page reloaded. Hydrate sets the committed tree first (so the
      // re-derived preview is grounded in current server state), then
      // restoreDraftFor layers the draft on top.
      useWorkspaceStore.getState().setConversation('conv_a');
      useWorkspaceStore.getState().setDraft({ ops: draftOps as never, tree: previewTree });
      useWorkspaceStore.getState().setScriptText('user edit before reload');
      useWorkspaceStore.getState().setScriptDirty(true);

      // Simulate the F5: in-memory state wiped, persisted map intact.
      useWorkspaceStore.getState().reset();
      // Hydrate writes the committed tree first (would normally be a
      // server snapshot; here we set it directly).
      useWorkspaceStore.getState().setDerived({
        tree: { trees: [{ key: 'trip', slots: {}, children: [] }], relations: [] },
        sourceIndex: new Map(),
        opsLog: [],
      });
      useWorkspaceStore.getState().setConversation('conv_a');

      const restored = useWorkspaceStore.getState().restoreDraftFor('conv_a');

      expect(restored).toBe(true);
      const s = useWorkspaceStore.getState();
      expect(s.hasDraft).toBe(true);
      expect(s.draftOps).toEqual(draftOps);
      expect(s.scriptText).toBe('user edit before reload');
      expect(s.scriptDirty).toBe(true);
      // Preview tree is re-derived from `tree` (committed) + draftOps —
      // not the stale persisted preview from before the reload. The
      // committed tree didn't have `dest` but the draft adds it.
      expect(s.draftTree).not.toBeNull();
      expect(s.draftTree?.trees[0]?.slots.dest).toBe('HZ');
    });

    it('restoreDraftFor with empty ops snapshot is a no-op (avoids stale-draft state)', () => {
      // Defensive: a corrupted snapshot with empty ops shouldn't flip
      // hasDraft true or change anything. setDraft also rejects empty
      // ops at write time, but restore must mirror that contract.
      useWorkspaceStore.setState({
        draftsByConversation: { conv_x: { ops: [], scriptText: 'oops', scriptDirty: false } },
      });
      const result = useWorkspaceStore.getState().restoreDraftFor('conv_x');
      expect(result).toBe(false);
      expect(useWorkspaceStore.getState().hasDraft).toBe(false);
    });

    it('isolates drafts between conversations (no cross-leak on restore)', () => {
      // Stage two distinct drafts and verify each restore reads ONLY
      // the matching id's snapshot. A bug here would show up as
      // conv_a's draft appearing in conv_b after a switch+F5.
      useWorkspaceStore.getState().setConversation('conv_a');
      useWorkspaceStore.getState().setScriptText('script for A');
      useWorkspaceStore.getState().setDraft({ ops: draftOps as never, tree: previewTree });

      const opsB = [
        {
          define: { path: 'other_root' },
          source: {
            type: 'llm' as const,
            model: 'gpt-4o-mini',
            at: '2026-04-26T01:00:00Z',
            turn_ref: { turn_hash: 'sha256:t2', quote: 'other_root' },
          },
        },
      ];
      useWorkspaceStore.getState().setConversation('conv_b');
      useWorkspaceStore.getState().setScriptText('script for B');
      useWorkspaceStore.getState().setDraft({
        ops: opsB as never,
        tree: { trees: [{ key: 'other_root', slots: {}, children: [] }], relations: [] },
      });

      // Wipe in-memory and re-hydrate as conv_a.
      useWorkspaceStore.getState().reset();
      useWorkspaceStore.getState().setConversation('conv_a');
      const restoredA = useWorkspaceStore.getState().restoreDraftFor('conv_a');
      expect(restoredA).toBe(true);
      let s = useWorkspaceStore.getState();
      expect(s.draftOps).toEqual(draftOps);
      expect(s.scriptText).toBe('script for A');

      // Now switch to conv_b. Reset wipes A's in-memory draft; restore
      // for B brings B's draft back. A's persisted entry is left
      // intact for the eventual return trip.
      useWorkspaceStore.getState().reset();
      useWorkspaceStore.getState().setConversation('conv_b');
      const restoredB = useWorkspaceStore.getState().restoreDraftFor('conv_b');
      expect(restoredB).toBe(true);
      s = useWorkspaceStore.getState();
      expect(s.draftOps).toEqual(opsB);
      expect(s.scriptText).toBe('script for B');
      // Sanity: both persisted entries still present.
      expect(useWorkspaceStore.getState().draftsByConversation.conv_a).toBeDefined();
      expect(useWorkspaceStore.getState().draftsByConversation.conv_b).toBeDefined();
    });

    it('fresh Extract on the same conversation overwrites the persisted entry', () => {
      // Re-extract is the natural retry flow: previous LLM proposal is
      // replaced by the new one. The persisted snapshot must follow —
      // otherwise an F5 right after re-extract would restore the OLD
      // proposal that the user explicitly threw away.
      useWorkspaceStore.getState().setConversation('conv_a');
      useWorkspaceStore.getState().setDraft({ ops: draftOps as never, tree: previewTree });
      const before = useWorkspaceStore.getState().draftsByConversation.conv_a;
      expect(before.ops).toEqual(draftOps);

      const newOps = [
        {
          set: { path: 'trip/budget', value: 'twenty thousand' },
          source: {
            type: 'llm' as const,
            model: 'gpt-4o-mini',
            at: '2026-04-26T02:00:00Z',
            turn_ref: { turn_hash: 'sha256:t3', quote: 'twenty thousand' },
          },
        },
      ];
      useWorkspaceStore.getState().setDraft({
        ops: newOps as never,
        tree: {
          trees: [{ key: 'trip', slots: { budget: 'twenty thousand' }, children: [] }],
          relations: [],
        },
      });

      const after = useWorkspaceStore.getState().draftsByConversation.conv_a;
      expect(after.ops).toEqual(newOps);
      // Map should still have exactly one entry for this conversation.
      expect(Object.keys(useWorkspaceStore.getState().draftsByConversation)).toEqual(['conv_a']);
    });

    it('discard sequence (clearDraft + clear scriptText/Dirty) removes persisted entry', () => {
      // Mirrors AfterPanel.handleDiscard. After discard, the persisted
      // map must not retain an applicable draft — otherwise an F5
      // would restore something the user explicitly threw away.
      useWorkspaceStore.getState().setConversation('conv_a');
      useWorkspaceStore.getState().setScriptText('user edits');
      useWorkspaceStore.getState().setDraft({ ops: draftOps as never, tree: previewTree });
      useWorkspaceStore.getState().setScriptDirty(true);
      expect(useWorkspaceStore.getState().draftsByConversation.conv_a).toBeDefined();

      // Discard sequence:
      useWorkspaceStore.getState().clearDraft();
      useWorkspaceStore.getState().setScriptText('');
      useWorkspaceStore.getState().setScriptDirty(false);

      expect(useWorkspaceStore.getState().draftsByConversation.conv_a).toBeUndefined();
    });

    it(`evicts oldest entries when the map exceeds the LRU cap (${DRAFT_PERSISTENCE_CAP})`, () => {
      // Stage drafts on cap+5 conversations. The map should size at
      // exactly cap, with the oldest 5 (conv_0..conv_4) evicted.
      const opsFor = (i: number) => [
        {
          set: { path: `root/${i}`, value: `v${i}` },
          source: {
            type: 'llm' as const,
            model: 'gpt-4o-mini',
            at: '2026-04-26T00:00:00Z',
            turn_ref: { turn_hash: `sha256:t${i}`, quote: `v${i}` },
          },
        },
      ];
      const total = DRAFT_PERSISTENCE_CAP + 5;
      for (let i = 0; i < total; i++) {
        useWorkspaceStore.getState().setConversation(`conv_${i}`);
        useWorkspaceStore.getState().setDraft({
          ops: opsFor(i) as never,
          tree: { trees: [], relations: [] },
        });
      }

      const map = useWorkspaceStore.getState().draftsByConversation;
      expect(Object.keys(map)).toHaveLength(DRAFT_PERSISTENCE_CAP);
      // The 5 oldest are gone.
      for (let i = 0; i < 5; i++) {
        expect(map[`conv_${i}`]).toBeUndefined();
      }
      // The newest cap entries are present.
      for (let i = 5; i < total; i++) {
        expect(map[`conv_${i}`]).toBeDefined();
      }
    });

    it('touching an existing entry refreshes its LRU position (does not evict it)', () => {
      // Fill the map to the cap with the conv_a entry oldest. Then
      // touch conv_a (re-Extract / edit). One more new entry should
      // evict the *next* oldest (conv_1), not conv_a — proving the
      // re-insert behaviour of writeDraftSnapshot.
      useWorkspaceStore.getState().setConversation('conv_a');
      useWorkspaceStore.getState().setDraft({ ops: draftOps as never, tree: previewTree });
      for (let i = 1; i < DRAFT_PERSISTENCE_CAP; i++) {
        useWorkspaceStore.getState().setConversation(`conv_${i}`);
        useWorkspaceStore.getState().setDraft({
          ops: [
            {
              set: { path: `root/${i}`, value: `v${i}` },
              source: {
                type: 'llm' as const,
                model: 'gpt-4o-mini',
                at: '2026-04-26T00:00:00Z',
                turn_ref: { turn_hash: `sha256:t${i}`, quote: `v${i}` },
              },
            },
          ] as never,
          tree: { trees: [], relations: [] },
        });
      }
      // Touch conv_a — moves it to most-recent.
      useWorkspaceStore.getState().setConversation('conv_a');
      useWorkspaceStore.getState().setDraft({
        ops: draftOps as never,
        tree: previewTree,
      });
      // Add one more — should evict conv_1 (now oldest), not conv_a.
      useWorkspaceStore.getState().setConversation('conv_new');
      useWorkspaceStore.getState().setDraft({
        ops: [
          {
            set: { path: 'fresh', value: 'val' },
            source: {
              type: 'llm' as const,
              model: 'gpt-4o-mini',
              at: '2026-04-26T03:00:00Z',
              turn_ref: { turn_hash: 'sha256:tnew', quote: 'val' },
            },
          },
        ] as never,
        tree: { trees: [], relations: [] },
      });

      const map = useWorkspaceStore.getState().draftsByConversation;
      expect(map.conv_a).toBeDefined();
      expect(map.conv_1).toBeUndefined();
      expect(map.conv_new).toBeDefined();
    });
  });
});
