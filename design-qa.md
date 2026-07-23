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
