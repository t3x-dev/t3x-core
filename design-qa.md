# Design QA — Embedded Leaf Outputs

Date: 2026-07-23

## Visual sources

- Reference workspace: `C:/Users/user/AppData/Local/Temp/codex-clipboard-90f06ac2-03f3-48d4-8c7a-4991bbcec2ca.png`
- Current implementation capture: `C:/Users/user/AppData/Local/Temp/codex-clipboard-6e742af3-7140-42f0-8d1f-4c086049b0a7.png`
- Interaction source: `C:/Users/user/AppData/Local/Temp/codex-clipboard-c3d9f544-c4e6-4615-918b-3fd0e47d6780.png`

## Comparison

- The original Leaf workspace structure is preserved below the repository header and tab navigation.
- Source frames, output canvas, state points, constraints, assertions, and deploy/share regions retain their original hierarchy and density.
- The embedded header adds only the required Leaf switcher, selected-Leaf status, and New Leaf action.
- The workspace fills the remaining repository viewport without replacing the repository navigation.
- Existing Leaf and createable Leaf management is contained in a focused drawer rather than permanently reducing workspace width.

## Interaction verification

- Open Leaf routes to the repository Outputs path with a selected Leaf query.
- Create Leaf routes to the same Outputs path after persistence succeeds.
- Outputs reads the `leaf` query and opens that exact Leaf.
- Leaf switching updates the deep link without leaving Outputs.
- Canvas, Outputs, and Leaf workspace regression suites pass.

## Findings

- P0: none.
- P1: none.
- P2: none.
- P3: none required for this iteration.

final result: passed

---

# Design QA — State Structure Collapsible Nodes

Date: 2026-07-28

## Visual sources

- Selected design: `notes/docs/2026-07-28-state-structure-region-options-v2.html`
- Selected-state capture: `/private/tmp/t3x-state-collapsible-tree-final.png`
- Production capture: `/private/tmp/t3x-state-structure-implementation-1600.png`

## Comparison

- `Path / Key` and `Value` are adjacent; `Type` follows as secondary metadata.
- The production column proportions match the selected design closely: 36 / 35 / 6 / 8 / 9 / 6.
- Top-level PRD boolean requirements are summarized as one collapsed `Must conditions` row with a count and concise preview.
- `prd`, `Must conditions`, and `problem_context` use the same left-chevron and full-row interaction model.
- The former right-side `Expand` action is absent.

## Interaction verification

- Clicking the `Must conditions` row reveals all seven managed boolean fields and clicking it again hides them.
- Clicking `problem_context` hides and restores its descendants.
- Clicking `prd` hides and restores the complete managed tree.
- Search still reveals matching rows together with their ancestors.
- The restarted dev page and repository home both render meaningful content with no framework error overlay or browser console errors.

## Findings

- P0: none.
- P1: none.
- P2: none.
- P3: none required for this iteration.

final result: passed
