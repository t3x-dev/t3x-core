# Studio handoff browser verification

Issue #1517, dependent on #1546. Source release links attach Add to Studio to the corresponding exact-commit State Overview; arbitrary generic State does not pretend to be a published Schema. The drawer selects a destination project, keeps the version/hash fixed and recognizes existing candidates. There is one Studio per project.

Real Chromium uses an API-created source project/release/introduction and a separate destination project. It adds from State Overview, keeps browsing, repeats the selection, opens the existing candidate and asserts one persisted candidate and no change to the source Workspace. Both fixture projects are cleaned up. No AI or mocked network.

Desktop and mobile screenshots were inspected before commit. Target selection, long hashes, actions and scrolling fit the mobile viewport. Candidates are visibly separate from applied Workspace bindings. The next Studio PR replaces the simple candidate strip with compare/selection/review controls.

- [Desktop drawer](handoff-desktop.png)
- [Mobile drawer](handoff-mobile.png)
- [Persisted candidates](candidates-desktop.png)

Additional hook tests ensure an old destination's in-flight addition cannot navigate after destination changes, and successful writes refresh persisted candidates. Typecheck, full WebUI tests and pre-push checks/build run before submission.
