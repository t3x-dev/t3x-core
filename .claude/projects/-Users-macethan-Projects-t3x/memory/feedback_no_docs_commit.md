---
name: no-docs-commit
description: Never commit docs/ to git — docs is a submodule and should stay local only
type: feedback
---

Do not commit files in the `docs/` directory to git. It is a submodule and specs/design docs are local-only.

**Why:** docs/ is a git submodule with its own repo. Committing from the parent repo causes submodule issues.

**How to apply:** When writing spec/design docs to `docs/superpowers/specs/`, skip the git add/commit step. Just write the file and move on.
