# Project header design QA

- Source visual truth: `/var/folders/76/v1bp39ld5tq6_xrg2gy7q5c00000gn/T/codex-clipboard-957265b2-bea6-4fc5-a9bc-96c1ffa6bda3.png`
- Centering direction: `/var/folders/76/v1bp39ld5tq6_xrg2gy7q5c00000gn/T/codex-clipboard-7a18fdc0-627b-4e0f-9b3b-3cd9dca326e9.png`
- Right-side branch control direction: `/var/folders/76/v1bp39ld5tq6_xrg2gy7q5c00000gn/T/codex-clipboard-98f7b70b-700f-4e16-85de-41cc30a20bec.png`
- Browser-rendered implementation: `/tmp/t3x-project-page-refined-final.png`
- Focused implementation header: `/tmp/t3x-project-header-qa-917-refined-final.png`
- Combined comparison: `/tmp/t3x-project-header-comparison-refined-final.png`
- Centered implementation capture: `/tmp/t3x-project-header-centered-page.png`
- Centered focused crop: `/tmp/t3x-project-header-centered-440x60.png`
- Centered combined comparison: `/tmp/t3x-project-header-centered-comparison.png`
- Final right-side branch capture: `/tmp/t3x-project-branch-right-final-v2.png`
- Final right-side branch crop: `/tmp/t3x-project-branch-right-crop-v2.png`
- Final right-side branch comparison: `/tmp/t3x-project-branch-right-comparison-v2.png`
- Route: `http://localhost:3000/t3x-dev/test-bug/schemas`
- Viewport: 917 x 2000 CSS px; header capture 917 x 56 px; device scale factor 1
- Centering QA viewport: 1280 x 720 CSS px; focused crop 440 x 60 px; device scale factor 1
- Source pixels: 917 x 57; focused implementation pixels: 916 x 56 after the browser JPEG capture was converted to PNG
- Normalization: each focused capture was padded to 918 x 58 before vertical comparison; no scaling was applied
- State: light theme, Schemas selected, project status active
- Branch-control QA: 1280 x 720 CSS px viewport; 278 x 62 px unscaled focused crop; device scale factor 1

## Full-view comparison evidence

The 56 px header is the complete comparison surface. The implementation matches the reference hierarchy: T3X brand, divider, compact owner/repository identity, text-only project navigation, and a soft-blue selected item. Runtime measurements confirm 8 px control radii, 28 px control height, 17.5 px top alignment, tokenized light shadows, blue selected text, a pure-white header layer, and a light gray 8 px top band. The retained green `active` status is an intentional user-requested addition.

The later centering direction changes that intentional offset: at the 1280 px browser viewport, the rendered navigation bounds are `x=466.09375`, `width=347.8125`, and `center=640`, exactly matching the viewport center of `640` with a measured delta of `0 px`. The repository identity and `active` status remain left-aligned and unchanged.

The final direction restores the real branch selector at the far right of the same header. Runtime measurement on Schemas is `x=1096`, `y=17.5`, `width=164`, and `height=28`; it is inside the banner, introduces `0 px` horizontal overflow, and preserves the centered primary navigation. State reuses its existing branch/create control through the header slot so there is no second visible copy.

## Focused region comparison evidence

The complete 917 x 56 px header remains the primary focused capture. The later centering pass also compares a centered 440 x 60 px crop from the 1280 px rendered viewport with the supplied navigation crop; typography, selected state, spacing, color, copy, and the group centerline are readable at original density.

## Required fidelity surfaces

- Fonts and typography: existing Inter UI stack retained; T3X uses the stronger display weight, repository and navigation use compact 12 px UI text.
- Spacing and layout rhythm: one 56 px row replaces the former stacked header and navigation; controls are vertically centered and follow the existing 4 px spacing scale.
- Colors and visual tokens: neutral panel/stroke tokens, commit-blue selected state, and success-green active status; no raw component colors added.
- Image quality and asset fidelity: the reference contains no raster assets or non-standard icons; no substitute assets were introduced.
- Copy and content: `State`, `Schemas`, `Workspaces`, `PRs`, and `Outputs` match the reference; `active` is intentionally retained.

## Interaction and runtime checks

- Navigated from Schemas to Workspaces and back through the rendered header links.
- Active route selection followed the destination.
- Browser console errors: none.
- Verified the centered navigation after the round trip; measured center delta remained `0 px` and page horizontal overflow remained `0 px`.
- Opened the right-side branch selector and verified that its branch dialog is rendered. Focused unit tests also cover switching an existing branch and creating a branch plus its workspace draft.

## Comparison history

- Pass 1: user review identified an actionable P2 mismatch in the control finish. Browser measurements confirmed both controls had `border-radius: 0px`, no shadow, the selected label rendered black, and controls began at 13.5 px instead of the reference-aligned 17.5 px.
- Fixes applied: replaced the undefined radius token with the runtime `--radius-md`, added the shared `--fx-shadow-sm`, forced the selected commit-blue text color, matched the light-blue and repository surfaces through token-based color mixing, and aligned content under the reference's 8 px top band.
- Pass 2: combined visual comparison and browser-computed measurements show no remaining actionable P0, P1, or P2 mismatch. The explicit `active` status and resulting horizontal offset remain expected product differences.
- Pass 3: the user requested the five primary project views to be centered as a group. The navigation is now positioned against the header viewport center at desktop widths, while widths below 900 px retain the compact horizontally scrollable flex fallback. The focused combined comparison and runtime measurement show no remaining centering drift.
- Pass 4: the user corrected the placement direction from left to right. The existing State branch control is now portaled into the right header slot, while non-State pages use the same branch data and creation workflow through `ProjectHeaderBranchControl`. The first focused comparison exposed a 16 px width mismatch; the control was increased from 148 px to 164 px, and the final unscaled side-by-side comparison now matches the reference control width and compact 28 px height.

## Findings

- No actionable P0, P1, or P2 findings.

## Follow-up polish

- None required for this scoped header change.

## Pass 5 correction

The branch selector should not live in the project header right slot. The previous
right-side header placement has been reverted. The real branch switch/create
control belongs back in the State toolbar, while the project header keeps the
single-line repository identity, active status, and centered primary navigation.

final result: superseded by Pass 5 correction
