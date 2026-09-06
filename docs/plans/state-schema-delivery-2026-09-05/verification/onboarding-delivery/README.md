# Onboarding State delivery verification

Legacy `introDemoStage=leaf` URLs resolve to the delivery tour. After selecting a commit, the tour highlights Snapshot in embedded Canvas or the existing State link in standalone Canvas. State remains responsible for revision selection and export; the tour does not create a Leaf or export automatically. The default one-step commit tour and Skip behavior remain available.

The coach uses space below or above the target on narrow screens rather than covering it. No new navigation surface was added.

Validation:
- 54 focused tour, project-route, and State tests passed. Unit coverage includes the standalone State-link path and a missing-target escape case.
- Production build and Chromium flow at 1480px and 390px: real project/commit, old Leaf-tour URL, commit selection, settled Snapshot spotlight, non-overlapping coach, navigation to Overview, visible Export, and no browser Leaf writes. Both passed with clean teardown.
- First browser run exposed the missing standalone-link target in embedded Canvas; added its existing Snapshot control as a target. Second run reached State but used an overly exact accessible name for Overview; corrected the selector to include its subtitle. Final run passed.
- Inspected `desktop.png` and `mobile.png` before commit. These are actual browser captures, not design mockups. Applied the React review checklist; component I/O boundaries unchanged.
