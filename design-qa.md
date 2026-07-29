# Schema family tabs — design QA

**Source visual truth**

- Path: `C:\Users\user\AppData\Local\Temp\codex-clipboard-034fb9a0-4159-4a44-aa88-4df5922a6eff.png`
- Pixels: 2005 × 1054
- State: PRD Schema v2, Structure view, desktop light theme

**Rendered implementation**

- Default PRD: `C:\Users\user\.codex\visualizations\2026\07\27\019fa303-800d-7e42-b34f-c0126bcc08dc\schema-tabs-prd-normalized.png`
- Skill Structure: `C:\Users\user\.codex\visualizations\2026\07\27\019fa303-800d-7e42-b34f-c0126bcc08dc\schema-tabs-skill-structure.png`
- Skill Relations: `C:\Users\user\.codex\visualizations\2026\07\27\019fa303-800d-7e42-b34f-c0126bcc08dc\schema-tabs-skill-relations.png`
- Skill mobile: `C:\Users\user\.codex\visualizations\2026\07\27\019fa303-800d-7e42-b34f-c0126bcc08dc\schema-tabs-skill-mobile.png`
- Desktop CSS viewport: 1604 × 843, device scale factor 1
- Mobile CSS viewport: 390 × 844, device scale factor 1
- Desktop implementation pixels: 1604 × 843
- Mobile implementation pixels: 390 × 844
- Density normalization: the 2005 × 1054 source was compared at 0.8 scale against the 1604 × 843 implementation viewport.
- Route/state: temporary local QA route using the production Schema Registry component; PRD Structure, Skill Structure, and Skill Relations states.

**Full-view comparison evidence**

- The existing card hierarchy, four-column fact strip, 280px version rail, table density, radii, shadows, semantic badges, and light theme tokens remain consistent with the source.
- The intentional difference is one additional family-selector row between the repository header and fact strip. It makes PRD and Skill directly selectable without displacing the version/detail hierarchy.
- Typography remains the existing Geist/system stack with the same heading, table, metadata, and badge hierarchy.
- No imagery or product assets are used on either screen.
- Copy was updated from a single-contract claim to multi-family repository contracts; PRD content remains unchanged.

**Focused region comparison evidence**

- Family tabs: active family uses the existing blue commit accent, underline, and compact version badge; inactive family remains neutral.
- Skill Relations: six typed relationships render in a two-column desktop grid with explicit source/target paths and constraint badges.
- Mobile: the family row stays horizontally available, facts stack to one column, the version browser stacks above detail content, and the document body has no horizontal overflow.

**Primary interactions tested**

- PRD is the default family with v2 selected.
- Skill is independently selectable and defaults to v1.
- Structure and Relations render the expected Skill data.
- Component tests verify per-family version memory, detail-view reset, selected-version YAML, and comparison eligibility.

**Console and runtime checks**

- The final fresh browser session reported no page errors and no framework error overlay.
- The existing repository shell separately remains affected by its pre-existing project-store loading issue; the isolated QA route was removed after capture.

**Findings**

- No actionable P0, P1, or P2 visual differences remain.
- P3: a future deep-link query for family/version/view would make shared review URLs restore the exact selected state.

**Comparison history**

- Pass 1: compared the source PRD state with the rendered PRD state and reviewed Skill Structure, Skill Relations, and mobile captures. No P0/P1/P2 issue was found, so no visual fix iteration was required.

**Implementation checklist**

- [x] Preserve the existing repository-contract visual language.
- [x] Add accessible PRD / Skill family tabs.
- [x] Keep version histories independent per family.
- [x] Add Skill Structure and Relations views.
- [x] Verify desktop and mobile layouts.
- [x] Remove the temporary QA route and test project.

final result: passed

## Schema-to-Workspace binding follow-up

- Desktop PRD: `C:\Users\user\.codex\visualizations\2026\07\27\019fa303-800d-7e42-b34f-c0126bcc08dc\schema-binding-prd.png`
- Desktop Skill: `C:\Users\user\.codex\visualizations\2026\07\27\019fa303-800d-7e42-b34f-c0126bcc08dc\schema-binding-skill.png`
- Persisted Workspace state: `C:\Users\user\.codex\visualizations\2026\07\27\019fa303-800d-7e42-b34f-c0126bcc08dc\schema-binding-workspace.png`
- Mobile binding state: `C:\Users\user\.codex\visualizations\2026\07\27\019fa303-800d-7e42-b34f-c0126bcc08dc\schema-binding-mobile.png`
- Verified routes: `/t3x-dev/schema-audit-20260713/schemas` and `/t3x-dev/lqw/schemas`; 1440 × 1100 and 390 × 844 viewports.
- The binding strip preserves the existing repository-contract hierarchy and adds two explicit actions: a project default for new Workspaces and a direct binding for the current persisted Workspace.
- Current runtime releases are actionable; draft and historical releases remain view-only. Binding copy makes commit immutability and candidate regeneration explicit.
- Browser verification found meaningful content, no framework error overlay, and no console/page errors. A repository without a persisted Workspace shows a disabled explanatory state; a repository with one shows its title in the action.
- Complete SHA-256 values remain available to assistive technology and on hover, while the visual value is compact enough for the metadata rail.
- The binding controls stack without introducing mobile overflow. The repository shell's existing horizontally scrollable top navigation and version rail still extend beyond the 390px document viewport; that behavior predates this binding change.
