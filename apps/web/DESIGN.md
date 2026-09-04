# T3X WebUI Visual Contract

This document records stable visual decisions for `apps/web`. It complements the
architecture rules in the repository `AGENTS.md`; runtime values in
`src/app/globals.css` are authoritative.

## Product Character

T3X is a calm semantic workbench: natural-language input should feel light, while
State, Workspace, diff, validation, and commit surfaces remain compact, precise,
and auditable. Visual decoration must not weaken object, status, evidence, or
decision hierarchy.

## Workbench Radius Profile

State is the reference surface for workbench corner geometry. Its current
implementation consistently uses a restrained hierarchy rather than large,
uniformly rounded cards:

| Level | Runtime token | Value | Use |
| --- | --- | ---: | --- |
| Workbench frame | `--radius-workbench` | `10px` | Main framed panels, message/result shells, composer frame |
| Dense group | `--radius-workbench-group` | `6px` | Rows, grouped content, compact icon tiles |
| Control | `--radius-workbench-control` | `5px` | Buttons, inputs, segmented controls |
| Inner selected state | `--radius-workbench-inner` | `4px` | Selected items, nested highlights, message-tail corner |
| Pill | `--radius-full` | `9999px` | Status badges, counts, chips only |

Rules:

- Match radius to hierarchy; do not give every surface the same large curve.
- Workbench frames use `10px`; repeated rows step down to `6px`; controls step
  down to `5px`; nested selected states use `4px`.
- Pills are reserved for status and compact metadata, not ordinary cards or
  primary containers.
- Chat composers may be more comfortable than dense controls, but Workspace
  Compose remains a workbench and uses the `10px` frame by default.
- Preserve a separately approved component-specific reference when fidelity is
  intentional. For example, the Compose send button remains `12px` because its
  focused visual reference was explicitly approved.
- Use the semantic tokens above instead of adding new one-off radius values in
  feature components.

## Compose Mapping

Workspace Compose follows the State hierarchy:

- user message, Draft Revision result, and composer frame: `10px`;
- Draft delta rows and the assistant identity tile: `6px`;
- Draft actions and row icon controls: `5px`;
- the user message tail corner: `4px`;
- status badges and source chips remain pills.

The Proposed Draft rail is a separate dense inspection surface. Its approved
layout and collapse behavior must not be changed as a side effect of Compose
message styling.

## Compose Action Color

The message-level `Add to source` control uses the product commit blue
(`--accent-commit`) for hover, focus, and selected states. In this surface the
control communicates inclusion in the active change workflow; it must not fall
back to the purple `--source` treatment. Source objects elsewhere retain their
normal source semantics.

## Compose Composer Controls

The Compose input bar keeps one clear left-to-right action hierarchy:

- `Add source` is the only source/attachment entry and uses a leading plus icon;
  do not add a separate unattached plus button beside it.
- The active model selector sits immediately before the send button so model and
  submit controls form one compact generation-action group.
- Model selection must use the shared provider/model availability and preference
  state; do not substitute a static model label or a visual-only mock menu.
- The input prompt remains the flexible middle region. Both control groups must
  stay stable and must not force horizontal overflow on narrow layouts.
