import type {
  StudioPreview,
  WorkspaceAuthoringView,
  WorkspaceTransitionReviewSnapshotEnvelope,
} from '@t3x-dev/api-client';
import { describe, expect, it } from 'vitest';
import { schemaWorkflowStatus } from '@/domain/schemas/schemaWorkflowStatus';

const draft = {
  workspaceRevision: 5,
  hasChanges: true,
  basis: { refName: 'main', refHead: 'base' },
  current: { title: 'Draft' },
} as WorkspaceAuthoringView;
const preview = {
  schemaHash: 'schema',
  workspace: { binding: {}, changes: [], canBind: false },
} as unknown as StudioPreview;
function review(outcome = 'rejected') {
  return {
    snapshot: {
      review: { precondition: { workspaceRevision: 5, refName: 'main', refHead: 'base' } },
      transition: { mode: 'transition', decision: { observation: 'supplied', outcome } },
    },
    schema_review: {
      draft: { status: 'bound', schemaHash: 'schema' },
      draftContent: { title: 'Draft' },
    },
  } as unknown as WorkspaceTransitionReviewSnapshotEnvelope;
}
describe('Schema workflow presentation', () => {
  it('prepares a complete Schema Review instead of reusing an incomplete snapshot', () => {
    expect(
      schemaWorkflowStatus({
        draft,
        preview,
        latest: { ...review(), schema_review: null },
        hasDefinition: true,
      }).hasNewChanges
    ).toBe(true);
  });
  it('keeps the rejected Draft without announcing the same content as a new Review', () => {
    expect(
      schemaWorkflowStatus({ draft, preview, latest: review(), hasDefinition: true })
    ).toMatchObject({
      hasChanges: true,
      rejected: true,
      hasNewChanges: false,
    });
    expect(
      schemaWorkflowStatus({
        draft: { ...draft, workspaceRevision: 7 },
        preview,
        latest: review(),
        hasDefinition: true,
      })
    ).toMatchObject({ rejected: true, hasNewChanges: false });
  });
  it('allows a new Review when either Schema or complete Workspace content changes', () => {
    expect(
      schemaWorkflowStatus({
        draft,
        preview: {
          ...preview,
          schemaHash: 'changed',
          workspace: { ...preview.workspace!, changes: [{ kind: 'added' }] as never },
        },
        latest: review(),
        hasDefinition: true,
      }).hasNewChanges
    ).toBe(true);
    expect(
      schemaWorkflowStatus({
        draft: { ...draft, workspaceRevision: 6, current: { title: 'Changed' } },
        preview,
        latest: review(),
        hasDefinition: true,
      }).hasNewChanges
    ).toBe(true);
  });
  it('does not reuse an undecided snapshot after its revision or branch basis changes', () => {
    expect(
      schemaWorkflowStatus({
        draft: { ...draft, workspaceRevision: 6 },
        preview,
        latest: review('accepted'),
        hasDefinition: true,
      }).hasNewChanges
    ).toBe(true);
    expect(
      schemaWorkflowStatus({
        draft: { ...draft, basis: { ...draft.basis, refHead: 'new-base' } },
        preview,
        latest: review(),
        hasDefinition: true,
      }).rejected
    ).toBe(false);
  });
  it('does not infer changes from missing status or from an unchanged saved definition', () => {
    expect(schemaWorkflowStatus({ preview, hasDefinition: true }).hasNewChanges).toBe(false);
    expect(
      schemaWorkflowStatus({ draft: { ...draft, hasChanges: false }, preview, hasDefinition: true })
        .hasNewChanges
    ).toBe(false);
  });
  it('recognizes the first Schema binding even if its definition is empty', () => {
    expect(
      schemaWorkflowStatus({
        preview: { ...preview, workspace: { ...preview.workspace!, binding: null } },
        hasDefinition: true,
      }).hasNewChanges
    ).toBe(true);
  });
  it('does not turn existing content validation gaps into new Schema changes', () => {
    expect(
      schemaWorkflowStatus({
        draft: { ...draft, hasChanges: false },
        preview: { ...preview, impact: { content: { ready: false } } } as StudioPreview,
        hasDefinition: true,
      }).hasNewChanges
    ).toBe(false);
  });
  it('uses the current Workspace contract when an older preview still reports changes', () => {
    expect(
      schemaWorkflowStatus({
        draft: {
          ...draft,
          hasChanges: false,
          currentSchema: { status: 'bound', schemaHash: 'schema', definition: {}, bindings: [] },
        },
        preview: {
          ...preview,
          workspace: { ...preview.workspace!, changes: [{ kind: 'added' }] as never },
        },
        hasDefinition: true,
      }).hasNewChanges
    ).toBe(false);
  });
  it('keeps a new saved source candidate reviewable even when the Workspace matches Base', () => {
    expect(
      schemaWorkflowStatus({
        draft: {
          ...draft,
          hasChanges: false,
          currentSchema: { status: 'bound', schemaHash: 'committed', definition: {}, bindings: [] },
        },
        preview,
        hasDefinition: true,
      }).hasNewChanges
    ).toBe(true);
  });
});
