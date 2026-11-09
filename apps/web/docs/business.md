# WebUI Business Contracts

## Scope and status

This document covers the Content and Schema change workflow across State,
Schema and Workspace. It consolidates established system contracts and defines
the vocabulary needed to discuss frontend behavior.

The inherited system contracts and frontend contracts B-01 through B-07 are
normative. They define target behavior and acceptance expectations. API/source
references explain concepts and help locate implementation; they do not prove
that the current UI conforms. Keep implementation gaps in the team's work
records, separately from these decisions.

Other product areas remain subject to repository-level contracts; their detailed
frontend workflows are outside this document's scope. These frontend decisions
do not change protocol, authorization, server capabilities or release status.

## Owning references

| Source | What it owns |
| --- | --- |
| [Repository product frame](../../../AGENTS.md#project-frame) | Deterministic change law, public protocol nouns and governance lifecycle |
| [Reliable Workspace](../../../docs/architecture/reliable-workspace-gate-1.md#frozen-behavior) | Draft identity, guarded writes, concurrency, reconciliation and optional PRs |
| [Application convergence](../../../docs/architecture/transition-application-convergence.md#invariants) | Immutable evidence, stale-review rejection and compatibility limits |
| [Exact State export](../../../docs/architecture/state-export.md) | Complete committed values, exact-version identity and export verification |
| [Workspace API types](../../../packages/api-client/src/workspace-authoring.ts) | Draft projection, action identity and expected-version request fields |
| [Schema API schemas](../../../packages/api-client/src/schema-studio.ts) | Schema candidates, preparation, review content and publication request shapes |
| [Review API types](../../../packages/api-client/src/types.ts) | ReviewSnapshot and Decision transport fields |

Wire types describe what a request or response carries. They do not by
themselves decide page ownership, save UX or permission policy. Frozen system
contracts remain owned by their original documents and Issues.

## Established contracts

### Change and authority

The system law and governance lifecycle remain:

```text
Result = Replay(Base, DefinitionOf(Effect))
Propose -> Verify* -> Decide -> Commit?
```

Deterministic replay verification is required. Commit is available only after
an accepted or authorized overridden Decision. Rejection remains auditable and
does not advance history. Preparation, revisions, retries and frontend stages
compose this lifecycle; they do not introduce protocol lifecycle hooks.

WebUI consumes shared application projections and command capabilities. It does
not implement an alternative writer or authorization evaluator. LLM output can
propose changes; it cannot replace deterministic mutation or verification.

### Workspace identity and concurrent changes

- A persisted Workspace belongs to a server-derived principal and project/ref
  basis. `workspace_id` selects it; a project, branch, browser, port or claimed
  user identity alone does not select or authorize a private Draft.
- The same principal's clients share a Draft only when they explicitly select
  the same Workspace. Another principal cannot read or mutate that private Draft.
- Supported writers use the authorized application boundary with durable request
  identity and expected Workspace revision/ref head. The authoring API also
  carries the expected composition revision.
- Ref advancement uses compare-and-swap. Incompatible competing advances cannot
  both succeed, and a losing Workspace retains its Draft.
- A newer target ref must not silently overwrite, rebase or resolve the Draft.
  Reconciliation has a deterministic preview and an explicit, auditable choice.
- A PR is optional. Creating one or displaying old readiness does not authorize
  merge; protected-ref policy is enforced at the authoritative advance.

These requirements come from Reliable Workspace's frozen behavior and
[unified-write contract](../../../docs/architecture/reliable-workspace-gate-1.md#task-03-verification).
They do not mandate a particular frontend store or polling strategy.

### Review, history and export

Review and Decision are bound to exact revisions and evidence. A stale base,
stale Review, missing authority or failed replay must fail before commit.
Historical effects, statements, commits and review evidence are not rewritten to match a live editor.

Exact export reads the complete value from an explicitly identified committed
State. It does not select a newer HEAD or reconstruct that value from a semantic
display projection. The browser verifies the returned revision, format, byte
length and artifact hash. Download initiation does not prove deployment,
validation or restoration.

## Objects and task boundaries

### Vocabulary and identity

| Concept | Meaning in this workflow | Relevant identity |
| --- | --- | --- |
| Content | The business document being changed; distinct from material or model input context | Explicit Workspace and basis while drafting; exact State/Commit descriptors in history |
| Schema | Definitions and constraints applied to Content | Exact binding, definition hash and source/version references |
| Workspace | Principal-private persisted work targeting a shared ref | Project scope, explicit Workspace ID and Workspace revision |
| Draft action | An authoring action describing a persisted change | Action ID, sequence and before/after composition revisions |
| Schema edit candidate | A separately saved definition edit awaiting subsequent use | Candidate ID/revision, base and result definition references |
| ReviewSnapshot | A fixed review record with the facts needed for Decision | Snapshot ID/digest, Transition ID and Review preconditions |
| Commit / State | Immutable committed history and its resulting value | Commit digest and referenced State descriptor |

| Surface | Product responsibility |
| --- | --- |
| State | Read a selected committed version, inspect its content/history and export its exact value. Editing repository metadata or presentation is a separately named capability. |
| Schema | Compose and edit definitions, save candidates, inspect their impact and publish an exact eligible definition. An inline editor and a dedicated editor follow the same candidate rules. |
| Workspace | Own the editing session, gather material, apply Content edits, coordinate effective Schema changes, prepare Review and hand off the fixed review to a Decision. |

Page location does not grant a second content authority. State does not mutate
its displayed committed Content in place. Draft editing always selects an
explicit Workspace; moving between dedicated and inline editors cannot silently
change that Workspace or create a separate definition.

## Frontend contracts

### B-01: Local edits and save meaning

The user-visible stages are distinct:

```text
Editor input -> Local changes -> Saved Draft -> Fixed Review -> Committed State
```

These stages describe frontend work, not additional protocol lifecycle hooks.
The ownership of each stage is [A-01](architecture.md#a-01-state-ownership-and-sharing).

| Stage / action | Promise |
| --- | --- |
| Editor input | The entered value is local to the editor and has not been applied. |
| Apply edit | Valid input enters the Workspace working copy. Label it as local/unsaved; all working-copy views use the same result. |
| Save changes | Persist the explicitly selected changes through the guarded command. Only a server acknowledgement establishes Saved Draft, with its returned outcome/version. |
| Prepare Review | Freeze the selected saved version and run its application checks. This does not commit or publish it. |
| Confirm a Decision | Act on the fixed Review and its exact preconditions; history advances only when the application confirms a Commit. |

Preserve a single working copy when closing an editor or switching tools within
the Workspace session. Before dropping unapplied input, offer Apply, Discard or
Cancel. Before leaving a dirty Workspace or entering saved-Draft Review, require
Save, Discard or Cancel for the local changes. A failed or uncertain save does
not count as a successful exit; a partial save leaves the remaining changes
visible and subject to the same guard. Discard identifies its local scope and
does not imply undoing a persisted action or an in-flight server command.

A page reload/browser close has no recovery guarantee for unsaved input. Show
an unsaved warning and use browser unload protection where supported. Do not
promise prevention of a forced close or browser-managed recovery. Do not
persist private working copies to browser storage by default; offline recovery
is a separately scoped capability. Saved Draft recovery uses the server.

If a local operation cannot be applied, retain the input/changes and show the
failure. Do not silently fall back to displaying the saved baseline while
implying the local preview succeeded.

**Acceptance:** Apply updates every working-copy view without claiming a save;
partial save retains the remainder; closing an editor retains applied local
changes; leaving or discarding never silently loses them.

### B-02: Object and version labels

Every editing or review context makes its project, branch, Workspace, stage and
relevant version identifiable. Use progressive detail rather than requiring
users to read protocol digests for routine work.

- Name the revision's subject: Workspace revision, Content revision or Schema
  candidate revision. Do not invent a revision, default an unknown revision to
  zero, or imply these independent revisions should be equal.
- Label counts as changed objects, operations or another actual counted unit.
  An operation fallback is not an object count. A count must not look like `rN`.
- Identify the exact baseline Commit, or say Empty base only when that fact is
  confirmed. Missing/unreadable data is Unavailable, not an empty baseline.
- Identify a fixed Review by its snapshot and reviewed Workspace revision; identify
  committed State by its Commit. A shortened ID has a way to inspect/copy its
  complete value. Titles and summaries are supplementary, not identity.
- State whether displayed data is a local preview, saved Draft, fixed Review or
  committed State, and identify a newer available version without relabelling
  the inspected version as current. Exported/copied documents retain their
  stage/version association in the filename or accompanying metadata.

**Acceptance:** users can match the same object/version across views, distinguish
counts from revisions, and distinguish a confirmed empty base from a failed load.

### B-03: The version being reviewed

Current-Draft Review uses the explicitly inspected saved Draft revision. Its
Content and effective Schema, baseline, labels and checks refer to that same
subject. External changes announce a newer revision; loading it is explicit.
Local unsaved changes are handled under B-01 and are never silently excluded
while the UI implies that they were reviewed.

Prepare Review must use the displayed Workspace/composition revision and ref
head. If a fresh read or command finds a different subject or precondition,
stop preparation, preserve the existing view and explain that the Draft or branch
changed. Offer loading the new version or the supported synchronization path;
do not silently prepare the newly discovered content. A newer version requires
inspection and a new explicit preparation action.

If Schema preparation changes Content, show its exact before/after and impact
before applying it under B-04. The resulting Draft becomes a new identified
subject for inspection and Review. A previous confirmation does not authorize
unexpected new changes.

Fixed Review views read that snapshot's values and evidence. Refresh may show a
later Decision/Commit result for the same Transition and unchanged reviewed
subject; it must not substitute a new Draft or silently switch Transitions.
A superseded or stale Review remains readable with an explanation. It cannot
authorize a new decision against different facts. Confirmation uses the fixed
preconditions; the application remains authoritative on validity.

**Acceptance:** an external rN+1 does not replace inspected rN; Prepare cannot
silently freeze rN+1. A stale Review preserves its historical values and cannot
reuse its readiness for a different version.

### B-04: Schema adoption and publication

Editing a definition, saving a candidate, adopting it into a Draft, preparing
Review, committing and publishing a public version are separate operations.
Label their outcomes separately; completing one does not imply the others.

1. A preview identifies its exact sources, definition and candidate/version.
   The definition to save/adopt must be the one previewed. A promise to retain
   local edits includes them in that preview; unresolved source conflicts or
   exclusions are shown before saving, not silently chosen.
2. Saving a candidate does not itself adopt its definition or alter Content.
   Dedicated and inline editors use the same Workspace/candidate identity and
   local-edit protections. Preserve local Content edits when switching editors;
   resolve them under B-01 before an adoption that changes their baseline.
3. Adoption uses the authoritative preparation preview and its exact revision,
   Schema and preview identity. Show Content adaptations and destructive impact;
   an explicit adoption confirms that preview only. Changed inputs invalidate
   the confirmation. Zero Content changes still require an explicit adoption
   action, not background replacement of the effective Schema.
4. Public publication targets an exact saved, checked candidate using the API's
   candidate reference, Workspace precondition and review hash. Do not add a
   requirement to Commit the Workspace first. Show the definition inspection
   entry, candidate version, public visibility and publication metadata before
   submission. Changes to the candidate or relevant preconditions invalidate
   the checked publication target.
5. Publish only the chosen Schema definition and explicit publication metadata,
   not Workspace Content or private source material. Explain an unavailable or
   disabled action using the actual missing condition. Validate fields against
   the owning [publication schema](../../../packages/api-client/src/schema-studio.ts),
   show field-level feedback, and do not invent stricter identifier/version rules.

If the supported service cannot supply an exact target or preparation, mark the
operation unavailable and report the capability gap. Do not synthesize approval
or imply that a locally generated preview is authoritative.

**Acceptance:** preview, saved/adopted definition and prepared result agree;
changed targets invalidate old confirmation. Publication does not expose Content
or require an unrelated Workspace Commit.

### B-05: Failure and recovery feedback

Use the command outcomes in [A-03](architecture.md#a-03-write-acknowledgement-and-recovery)
with the following user-facing meaning:

| Situation | Required feedback and next action |
| --- | --- |
| Invalid local input | Say it was not submitted, identify the field/reason and retain the input. |
| Authoritative rejection | Explain the actual reason, affected object/path and a supported correction. Retain local work; concurrency refusal requires reviewing the newer context. |
| Write outcome unknown | Say the result is not yet confirmed. Retain the original request/input, resolve through supported evidence, and offer an exact retry only when allowed. |
| Write confirmed, read failed | Say the changes were saved but the display could not refresh. Offer refresh; do not instruct the user to save again. |
| Read unavailable with old data retained | Label the retained version and the failed refresh; do not imply that it is the newly requested version. |

Keep consequential save/recovery feedback available in the affected workflow;
a transient toast alone is insufficient. Show the structured failure code and
raw details as inspectable evidence, with plain-language guidance first.

Map recovery to the actual failing condition and available action. Source
replacement, deletion confirmation and missing evidence are different problems;
a generic fix-fields or retry instruction must not stand in for a missing
capability. Preserve independent failures when one is resolved. If no supported
recovery action is available, state that limitation and investigate ownership
of the capability gap. An unconnected existing API or missing frontend entry is
a frontend gap; record a confirmed backend defect in the team's external
`Record-backend.md`. Do not fabricate an action or promise it will unblock the
workflow.

**Acceptance:** a confirmed write stays confirmed after a failed read; a lost
response cannot produce a different retry; recovery addresses the reported
condition and preserves usable input and unrelated evidence.

### B-06: Content representation and consistency

For one identified stage/version, Changes, YAML and Preview derive from the
same base/result pair. Changing a view changes representation, not the subject.
Historical data missing from a fixed Review is Unavailable; the live Draft is
never substituted to fill it.

| View | Content promise |
| --- | --- |
| Changes | Exact changes relative to the named baseline. Unchanged data may be filtered; added/deleted parent and descendant values remain consistent. |
| Content YAML / complete document | The complete business value for the selected stage/version, including business fields and relations. Formatting need not preserve source YAML bytes. |
| Structure YAML, tree or specialized reader | A named projection with its included scope, omitted data and a route to the complete value made clear. It cannot be presented as a complete source document. |
| Fixed-State export | The complete value of the exact Commit/State, verified under the existing export contract. It is not reconstructed from any display projection. |

A protocol envelope may be collapsed for reading only when its relationship to
the business value is explicit. A field named `readme` is not automatically
presentation metadata. Preserve field presence/absence, array ordering, values
and relations when claiming complete-value equivalence. Friendly paths may be
projected, but inspection retains their mapping to authoritative paths.

Matching labels, object counts or partial hashes alone does not establish content
equivalence. For affected representations, verification compares the relevant
structured values and included scope. Use fixtures containing nested values,
arrays, absent/null fields and relations. If the complete historical value is
unavailable, retain a labelled projection or unavailable state without claiming
complete-value consistency.

**Acceptance:** the same selected version yields consistent values across views;
relations or other omitted data are not mistaken for deletion; complete-value
views/export agree as structured values, not necessarily as serialized text.

### B-07: Check scope and readiness

Each check identifies its subject/version, Content or Schema scope, status and
reason. Keep observation, outcome and freshness distinguishable:

| Status | Meaning |
| --- | --- |
| Passed | A conclusive successful observation for the stated subject. |
| Failed | A conclusive failure for that subject; retain its findings. |
| Not applicable | The application explicitly declares this check inapplicable and supplies its scope/reason. |
| Not observed | No observation is recorded; this alone says neither that a requirement is missing nor that it passed. |
| Missing required evidence | An identified application requirement lacks its evidence. |
| Pending / inconclusive | Work is running or has no conclusive outcome; do not map it to Passed or invent a failure. |
| Stale | Evidence applies to older/different facts. Preserve its original outcome with a freshness warning; it does not authorize the current subject. |

Do not infer Not applicable from no visible fields, no run, or a missing response.
An exemption for Content validation says nothing about unrelated checks. Do not
reapply a current rule or inferred exemption to rewrite historical evidence.

Decision controls require matching loaded review data and the application's
current capabilities. The frontend may block invalid or incomplete input; it
cannot grant permission or relax policy because some check looks successful.
Loading, unknown freshness or missing authority cannot appear as ready. Recheck
at the authoritative command boundary rather than trusting a cached button.

Override is available only when the application authorizes it and requires an
explicit reason. It does not bypass identity, authorization, deterministic replay,
integrity or stale-base guards. Keep the original failed findings visible with
the recorded override. Reject is a separate auditable outcome and never advances
the branch.

**Acceptance:** Schema-only exemptions preserve their precise scope; older checks
do not authorize a new revision; failed/inconclusive/missing evidence stays
visible and an authorized override does not erase the failure.

## Applying these contracts

Together with [A-01 through A-05](architecture.md#frontend-contracts), these rules
resolve the frontend boundaries listed during documentation consolidation.
Implement changes against the relevant IDs and record any nonconforming behavior
as an implementation gap. Contract adoption does not mark existing code, tests
or business acceptance complete. Use a future explicit decision for new product
requirements rather than inferring them from implementation convenience.
