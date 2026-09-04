# Workspace Compose Proposed Draft Design QA

final result: blocked

Date: 2026-08-26
Workspace: `/Users/wangyaxin/Desktop/wyx/t3x`
Branch: `codex/workspace-two-tab-fidelity`
Preview URL: `http://localhost:3000/t3x-dev/test-bug/workspaces?branch=555&workspace=workspace_branch%3A555`

## Latest Add-to-source color pass

Source visual truth:
- `/var/folders/76/v1bp39ld5tq6_xrg2gy7q5c00000gn/T/codex-clipboard-5456c159-a817-4cd6-a3f2-658c6e826ebc.png`

Implemented:
- Replaced the purple `--source` border, text, hover, focus, and selected treatment on both message-level `Add to source` controls with the project `--accent-commit` blue.
- Preserved the button dimensions, radius, external placement, toggle behavior, label, and selected checkmark.

Current blocker:
- The in-app browser still blocks the local Workspace URL, so no post-edit rendered comparison is available.

## Latest State-aligned radius pass

Reference truth:
- State implementation in `ProjectStateTab.tsx` and `StateBranchControls.tsx`.
- Runtime token source: `apps/web/src/app/globals.css`.

Implemented:
- Recorded the State-derived `10/6/5/4px` workbench radius hierarchy in `apps/web/DESIGN.md` and linked it from the WebUI README.
- Added semantic workbench radius tokens to `globals.css`.
- Changed the Compose user message, Draft Revision frame, assistant tile, delta rows, Draft action, and composer frame to the corresponding State hierarchy.
- Preserved the approved `12px` send button, pill badges/source actions, Proposed Draft rail, and its collapse behavior.
- Restored the previously requested wider `1040px` Compose content track after it was overwritten by a concurrent task.

Current blocker:
- The in-app browser rejected the local Workspace URL under its URL safety policy, so a fresh rendered State/Compose comparison could not be captured.
- Source-level checks alone cannot mark this pass as visually passed; no alternate browser or policy workaround was used.

## Latest Compose horizontal-density pass

Source visual truth:
- `/var/folders/76/v1bp39ld5tq6_xrg2gy7q5c00000gn/T/codex-clipboard-43338ff2-5217-43b9-9cfd-541558090e19.png`
- Source pixels: `902 x 881`, treated as a 1x focused crop of the Compose conversation surface.
- Target state: light mode, Compose selected, Proposed Draft sidebar preserved outside the focused crop.

Implemented from the focused feedback:
- Increased the shared conversation and composer track from `760px` to `1040px` so the user message, assistant result, and input bar use substantially more of the available Compose pane.
- Increased the user message and assistant copy limits in step with the track, preventing the centered layout from retaining the old narrow reading column.
- Reduced responsive page-side padding from `20/32px` to `16/24px` while preserving a safe edge gutter.
- Preserved the Proposed Draft sidebar width, collapse behavior, content, and Review navigation.

Current focused-pass blocker:
- No post-edit browser-rendered screenshot is available because the in-app browser remains blocked by its local URL safety policy.
- Source-level formatting and whitespace checks can be completed, but the width pass cannot be marked visually passed without a fresh rendered capture at the same state and viewport.

## Latest Predicted Outcome compact-list pass

Source visual truth:
- `/var/folders/76/v1bp39ld5tq6_xrg2gy7q5c00000gn/T/codex-clipboard-c9c66da9-ea75-4dca-8c41-fe46d16e90bf.png`
- Source pixels: `599 x 225`, treated as a 1x focused outcome-list reference.
- Target state: light mode, Proposed Draft sidebar expanded, Predicted Outcome visible.

Implemented from the focused source:
- Replaced the three tall metric cards with one flat bordered result list.
- Matched the three 49px rows, internal dividers, 8px outer radius, old-value strike-through, arrow, bold new value, and right-aligned status chips.
- Used the existing T3X commit, success, neutral surface, stroke, and text tokens so the same structure remains legible in dark mode.
- Preserved the existing collapsible sidebar, artifact list, and Proceed to Review action.

Current focused-pass blocker:
- No post-edit browser-rendered screenshot is available because the in-app browser remains blocked by its local URL safety policy.
- The component passed Biome and whitespace checks, but the focused result cannot be visually compared or marked passed without a fresh rendered capture.

## Latest right-sidebar fidelity pass

Source visual truth:
- `/var/folders/76/v1bp39ld5tq6_xrg2gy7q5c00000gn/T/codex-clipboard-2aaff5fb-8a60-449d-b101-90ad752ca250.png`
- Source pixels: `369 x 873`, treated as a 1x focused sidebar reference.
- A/B/C/D/E/F controls are excluded as prototype chrome per the user's instruction.

Implementation evidence before the latest fixes:
- Full browser capture: `qa-sidebar-before-detail-pass-full.png`
- Focused sidebar crop: `qa-sidebar-before-detail-pass.png` (`370 x 738`)
- Browser viewport: `1245 x 864` CSS px, 1x density.
- State: light mode, Compose selected, Proposed Draft sidebar expanded.
- Combined comparison: `qa-sidebar-reference-vs-before.png` (`758 x 873`; reference left, pre-fix implementation right, implementation padded only to align the differing rail heights).

Earlier findings and fixes:
- P2 typography hierarchy: the implementation title and primary CTA text were visibly smaller/lighter. Fixed with an 18px extra-bold title and a 16px extra-bold CTA label.
- P2 spacing/rhythm: header/footer/body horizontal spacing and header height drifted from the reference. Fixed with 24px vertical header/footer padding, 16px compact horizontal padding at the 370px rail, and 24px horizontal padding at the 384px rail.
- P2 control and surface fidelity: the CTA was shorter and used a weaker neutral shadow. Fixed with a 52px height, 12px radius, commit-blue glow, and reference-like hover/active scaling.
- P2 icon/badge density: artifact icons and count badges were oversized. Fixed by reducing the file icons to 16px, reducing badge vertical padding, and using semibold artifact labels.
- P3 outcome details: result-card elevation and the two newly provisioned replica segments were under-expressed. Fixed with the existing medium shadow token and inset highlight on replica segments five and six.
- Preserved behavior: the sidebar remains expandable/collapsible with the existing top-left control and 48px collapsed rail.

Required fidelity surfaces:
- Fonts and typography: Inter hierarchy was adjusted for the title, artifact labels, outcome labels/values, and CTA.
- Spacing and layout rhythm: rail width, responsive padding, header/footer height, CTA dimensions, card gaps, and section letter spacing were adjusted against the reference.
- Colors and tokens: all changes use existing T3X semantic surface, stroke, commit, diff, and shadow tokens.
- Image/icon quality: no raster assets are required by this sidebar; existing library icons remain vector-rendered. The A-F prototype switcher is intentionally absent.
- Copy/content: Proposed Draft, artifact paths/counts, outcome values, and Proceed to Review remain aligned with the reference.

Current blocker:
- The in-app browser rejected the post-edit reload under its local URL safety policy. No alternate browser or automation workaround was used. The post-fix rendered sidebar therefore could not be captured and placed into a final side-by-side comparison.
- Until a fresh browser-rendered capture is available, the latest right-sidebar pass cannot honestly be marked visually passed.

Reference:
- Source screenshot: `codex-clipboard-0cc706f3-ef5d-4b2a-8243-df30a7f07ab4.png`
- Focused send-button truth: `/var/folders/76/v1bp39ld5tq6_xrg2gy7q5c00000gn/T/codex-clipboard-6f76946e-bc82-487c-b424-4c683dde86b8.png` (`52 x 55`, 1x)
- Source HTML transcript: `/Users/wangyaxin/.codex/attachments/baa51cfd-0d94-4775-ba23-50660186be1c/pasted-text.txt`

User-preserved requirements:
- Keep the right Proposed Draft sidebar collapsible.
- Keep the right Proposed Draft sidebar toggle at the sidebar's top-left edge.
- Keep `Add to source` on both user and assistant messages; clicking only toggles the checkmark and must not open an extra popover.
- Keep user metadata (`You` / avatar) outside the user message top-right, aligned like the timestamp/action metadata.
- Keep timestamps and `Add to source` actions outside the message/card frame, aligned to each frame's bottom-right edge.

Implemented:
- Rebuilt Compose as a centered chat transcript with a large `Draft Revision #6` result card.
- Replaced the old right `Current draft` rail with the reference-style `Proposed Draft` rail.
- Added `Modified Artifacts`, `Predicted Outcome`, replica bars, timeout progress, canary indicator, and bottom `Proceed to Review`.
- Restyled the bottom composer into a compact reference-style input bar with `+`, `Add source`, placeholder text, and a blue send button.
- Removed the old `What should we change?` workspace heading from this surface.
- Excluded the reference mock's A/B/C/D/E/F variation switcher because it is prototype chrome, not T3X product UI.
- Removed extra `Safety Checks` content from the first screen to match the supplied screenshot and reduce low-value label noise.
- Moved `You` / `AK` outside the user message top-right, matching the external metadata/action treatment.
- Moved `10:13 AM` and `10:14 AM` outside the user bubble and draft card while keeping them visually attached to the bottom-right edge.
- Aligned both `Add to source` actions outside the message/card bottom-right; after click the label remains `Add to source` and only gains a checkmark.
- Reworked the composer as a single-layer pill with `+`, `Add source`, placeholder text, and a compact commit-blue send button.
- Removed the composer top divider line and the `CMD + K` / `LAST SYNC` helper row to eliminate the large-frame-with-small-frame feel.
- Replaced the approximate play/arrow glyph with the exact Remix Icon asset named by the reference HTML: `ri-send-plane-2-fill`.
- Matched the focused control to a `40 x 40` commit-blue button, `12px` radius, `18 x 18` white paper-plane icon, and the existing T3X blue glow token.
- Removed the temporary `Source evidence` popover; source actions now only toggle selected state.

Verification:
- Browser DOM at 1245x864 and 1728x1116 confirmed:
  - no old `What should we change?` heading,
  - `Proposed Draft` present,
  - `Current draft` absent,
  - no mock variation switcher,
  - no `Source added` status label,
  - no horizontal overflow.
- Click verification confirmed `Add to source` keeps the same label, gains a checkmark, and does not open a source evidence popover.
- Message action verification confirmed:
  - no external `10:13 AM · YOU` metadata row remains,
  - two `Add to source` actions are present,
  - `Source added` does not appear,
  - clicking an action does not open a source evidence popover,
  - no horizontal overflow at 1245px.
- Composer verification confirmed:
  - one composer `Add source` button is present,
  - no `CMD + K` text remains,
  - no `LAST SYNC` text remains,
  - the page still has no horizontal overflow at 1245px.
- Assistant action verification confirmed `10:14 AM` and its `Add to source` button sit below the draft card frame, not inside the card footer.
- Focused send-button verification at a `1245 x 864` CSS viewport and 1x density confirmed `40 x 40` button bounds, `12px` radius, `18 x 18` icon bounds, commit-blue `rgb(37, 99, 235)`, and `/icons/send-plane-2-fill.svg` as the rendered asset.
- Focused source/implementation comparison: `qa-send-button-reference-vs-final.png` (`116 x 55`; left = `52 x 55` source, right = normalized `52 x 55` implementation with a 12px comparison gap).
- Browser console verification found no errors after the final reload.
- Latest focused browser metrics:
  - before click: `addCount = 2`, `hasOutsideYou = false`, `sourceAdded = false`, `scrollWidth = clientWidth = 1245`
  - after clicking both actions: `addToSourceCount = 2`, `pressedSourceButtons = 2`, `sourceEvidenceCount = 0`, `sourceAdded = false`, `scrollWidth = clientWidth = 1245`
- Sidebar click verification confirmed the proposed draft rail collapses to the narrow icon strip and restores via the top-left toggle.
- `biome check --write src/components/workspaces/WorkspaceComposeReviewSurface.tsx` passed.
- `biome check src/components/workspaces/WorkspaceComposeReviewSurface.tsx` passed.
- `git diff --check` passed.

Comparison history:
- P1: the previous Lucide arrow/play glyph did not match the reference paper-plane silhouette.
- Fix: traced the supplied reference HTML to `ri-send-plane-2-fill`, added the official Remix Icon SVG asset, then corrected the button radius and glow.
- Post-fix evidence: `qa-send-button-reference-vs-final.png`; no actionable P0/P1/P2 mismatch remains in the focused control.

Known limitation:
- Full `pnpm --filter t3x-webui typecheck` is currently blocked by pre-existing dirty `ProjectStateTab.tsx` type errors around `yamlText`; `WorkspaceComposeReviewSurface.tsx` does not appear in the typecheck errors.

Screenshots:
- Compose final 1245px: `qa-compose-reference-rebuild-final-1245.png`
- Compose final 1728px: `qa-compose-reference-rebuild-final-1728.png`
- Source clicked state: `qa-compose-reference-source-added-1245.png`
- Sidebar collapsed state: `qa-compose-reference-sidebar-collapsed-1245.png`
- Composer single-layer and outside actions: `qa-compose-input-actions-outside-1245.png`
- User source action clicked: `qa-compose-input-actions-outside-clicked-1245.png`
- Assistant source action outside card: `qa-compose-assistant-action-outside-1245.png`
- Both source actions clicked: `qa-compose-input-actions-outside-both-clicked-1245.png`
- Final send button crop: `qa-send-button-final-image.png`
- Send button source-versus-final comparison: `qa-send-button-reference-vs-final.png`
- Final full Workspace capture: `qa-workspace-send-button-final-image-full.png`

## 2026-08-26 Compose model/source control pass

Requested correction:
- Remove the standalone no-op plus control.
- Reuse that plus icon inside `Add source` instead of the database icon.
- Add a real model-switching entry immediately to the left of the send button.

Implemented:
- Reused `useChatModelSelection` and `GenerationModelSelector`, so the entry is
  backed by configured providers, available models, and the shared model
  preference store rather than a hard-coded label.
- Kept `Add source` in the left tool group with a plus icon and removed the
  separate `Add attachment` button.
- Kept the prompt as the flexible middle region and grouped model selection with
  the existing send control on the right.

Visual acceptance:
- Blocked: the in-app browser has already rejected this local URL under its URL
  safety policy, so this pass has no fresh browser-rendered screenshot.

Verification:
- Focused Biome check passed for the Compose surface and its new control-layout
  test.
- Focused Vitest passed: 2 files, 4 tests (surface wiring plus shared model
  selection persistence).
- `git diff --check` passed.
- Full WebUI typecheck remains blocked by concurrent `ProjectStateTab.tsx`
  `yamlText` contract errors at lines 627 and 652; the Compose surface is not in
  the reported error set.
