# WebUI journey audit — 7 September 2026

Reviewed the recent State, Workspace, Schema and Leaf-retirement changes on Core dev `127b11a6`, using a disposable real API/PostgreSQL project and the running WebUI. This is a bounded journey audit, not a claim that every screen changed over the last two weeks has been tested.

## Real case

Created `homelab-release-audit` through the repository form. Browsed Compose services 1.0.0, read its source/limitations, added the exact release to Studio, created a target Workspace, reviewed and applied the definition, and authored an nginx service through **Edit content**. Native validation passed; **Open Changes → Approve and save** created commit `6c07ed57774e…`. Added an author description and README, producing revision `59737d81087b…` with the same business State. Checked Overview, Structure, JSON Code, export format selection, download, and mobile render expansion.

No model calls, deployments, purchases, or live user data were involved. The service was defined and reviewed, not executed. Screenshots are actual UI captures; sample content was entered explicitly for this audit.

## Findings addressed

| Priority | Actual failure / misleading UI | Repair |
| --- | --- | --- |
| P1 | Studio had no target for a new project. Workspace's starter existed only in browser state. | Explicit branch-aware Create Workspace saves a fresh server draft, then selects it. No definition or business data is applied by creation. |
| P1 | Native Commit displayed validation pending and offered an invalid `t3x/state` registry validation. | Read the exact Commit's native Transition validation evidence; hide the incompatible legacy action. Failed/absent evidence is not presented as passed. |
| P1 | A decision updated local state but left the pre-decision snapshot URL. Reload reopened the old review. | Replace the route with the returned immutable snapshot; add an exact **View State & export** link after a Commit. |
| P1 | Editor allowed a second root despite the bound single-root contract; malformed roots produced 500. | Explain the required root, suppress a second-root action, guard review input, return an invalid-request error from the API. |
| P2 | Release detail had two primary actions: Add to Studio and a legacy Open in Studio shortcut. | Keep the exact-release Add to Studio flow; retain advanced tools inside Studio. |
| P2 | Comparison offered the selected candidate itself. | Exclude selected/unavailable candidates and clear stale comparison selections. |
| P2 | Homepage advertised retired Leaf generation and displayed Outputs, invented pending metrics and hardcoded “3 members”. | Remove these surfaces; show actual commit/branch counts and namespace scope. Relabel creation timestamps accurately. |
| P2 | Source import showed duplicate uploads and disabled manual-note/URL prototypes. | Keep Import doc and Paste text; retain their working upload/paste handlers. |
| P2 | Changes led with implementation warnings, repeated snapshot metadata and an empty Purpose card. | Move snapshot metadata into Advanced audit, omit unspecified claims, recognize native keyed operation labels. |
| P2 | Export looked interchangeable with Code. | State explicitly that it downloads the complete stored State, whose representation may differ from Code/render. Preserve the exact existing export contract. |

## Flow health and remaining work

- **Discover → Browse → release → Studio: improved.** Real samples and exact version provenance are useful. Creating a destination no longer requires an unexplained preparatory action elsewhere.
- **Workspace → review → Commit: functional, still needs refinement.** Native checks and immutable decisions work. The standalone Changes screen still shows low-level replacement operations; a semantic before/after diff should lead, with envelope assertions in advanced details.
- **Overview / Structure / Code: functional.** Author prose remains separate from the blue T3X-derived region, the compact icon and flexible README match the agreed layout. The derived summary still exposes the generic `candidate` wrapper instead of meaningful module sections. Derive inner sections from the pinned definition in a follow-up; do not guess or generate AI descriptions.
- **Deployment delivery: incomplete.** Verified export bytes contain `domain`, `content.trees` and `version`. Code also contains the `candidate` wrapper. Neither is a ready-to-run Compose file. Add a separate, explicit configuration export/projection with source Commit + renderer/version provenance, while retaining full-State export. Qualify that artifact using `docker compose config`; do not restore Leaf generation to solve this.
- **Mobile: usable for the tested flow.** Overview stacks author and render areas, and expand/restore works at 390×844. Header action strips still depend on horizontal scrolling; prioritize compact grouping in later polish.
- **Cloud usage:** authenticated desktop/mobile regression passed with a real isolated account. One shared Back link replaces duplicate responsive links. Managed AI, BYOK and checkout remain honestly unavailable in the fixture. This does not qualify real billing or paid model execution.

An author-only revision can have no native schema-validation statement even when its unchanged business State was validated in the parent. Display **No validation recorded** for that revision; do not silently inherit a green check.

## Evidence

| Capture | What it proves |
| --- | --- |
| [Homepage before](01-home-before.png) | Retired Leaf onboarding and stale metrics. |
| [Empty State](02-empty-state.png) | Original non-actionable starting state. |
| [Release actions before](03-release-actions-before.png) | Competing Studio actions. |
| [Studio before](04-studio-no-workspace-before.png) | Empty target and disabled Apply. |
| [Studio after](05-studio-applied-after.png) | Real persisted target, exact binding, explicit review result. |
| [Changes before](06-changes-before.png) | Excess audit scaffolding and raw operation labels. |
| [Structure](07-structure-after.png) | Actual saved nginx value. Captured before the final no-statement label refinement. |
| [Overview after](08-overview-after.png) | Author description/README and separate derived render. |
| [Mobile Overview](09-overview-mobile.png) | Actual stacked layout and scroll affordances. |

## Validation

- 94 targeted WebUI tests passed across nine suites, including fresh branch-aware Workspace creation, failed-save recovery, no invented branches, self-comparison exclusion, native passed/failed evidence, and post-decision navigation.
- 38 affected API tests passed across Workspace routes and Studio apply suites. A malformed-root request against the rebuilt running API returned HTTP 400 `INVALID_REQUEST`, not 500 ([response](invalid-root-response.json)).
- Core `pnpm check`, WebUI typecheck and production build passed (16 build tasks).
- Cloud: 35 focused settings/Workspace tests passed; authenticated usage browser regression passed at desktop and mobile sizes, including a single Back link and no page errors.
- The first API fixture attempt hit macOS shared-memory exhaustion while the interactive audit PostgreSQL was still running. Stopping this audit's server and running fixtures sequentially resolved it; no unrelated databases were stopped.

Remaining work above is intentionally explicit. This audit does not certify production deployment, all ecosystem validators, all authentication roles, or the entire two-week change set.
