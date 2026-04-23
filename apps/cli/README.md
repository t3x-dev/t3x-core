# @t3x-dev/cli

Command-line interface for T3X — semantic version control for AI conversations.

## First-Stage Scope

This CLI currently only promises one main path:

`create project -> extract -> show draft -> yops apply -> commit -> create leaf -> generate leaf`

The `commit` command is part of that path and commits a draft, not a local
YAML/JSON file.

## Core Rule

**CLI mutations to drafts go through YOps.** The CLI is a YOps pipeline, not a
semantic editor. It does **not** offer convenience commands like `slot set` or
`node add` because that would introduce a second mutation protocol in parallel
to YOps and break the project's "all tree mutation goes through YOps"
invariant.

## Environment

- `T3X_API_URL` — API base URL (default `http://localhost:8000/api`)
- `T3X_API_KEY` — Bearer token for authenticated endpoints
- `T3X_DRAFT` — default draft ID used when a command's `[draft-id]` positional
  is omitted by `show draft`, `delete draft`, `yops apply`, and `commit`

## Main Path

```bash
# 1. Create a project
t3x create project "Travel Notes"

# 2. Extract text into a draft
t3x extract -p proj_abc --text "I have 5000 yuan and want a 5-day Hangzhou trip."

# 3. Inspect the draft
t3x show draft draft_xyz
export T3X_DRAFT=draft_xyz

# 4. Apply YOps to the draft
t3x yops apply --file ops.yaml

# 5. Commit the draft
t3x commit -p proj_abc -m "Refine travel plan"

# 6. Create a leaf from the commit
t3x create leaf -p proj_abc -c sha256:commit_hash -t article --title "Hangzhou plan"

# 7. Generate the leaf output
t3x generate leaf leaf_abc
```

## Draft Commands

```bash
t3x list drafts --project proj_abc
t3x show draft draft_xyz
t3x delete draft draft_xyz --force
```

## YOps

```yaml
yops:
  - set:       { path: trip/budget, value: 5000 }
  - define:    { path: trip/activities }
  - populate:  { path: trip/hotel, values: { type: ryokan, area: Asakusa } }
  - drop:      { path: trip/old_plan }
```

```bash
t3x yops validate --file ops.yaml
t3x yops apply draft_xyz --file ops.yaml
export T3X_DRAFT=draft_xyz
t3x yops apply --file ops.yaml
t3x yops apply draft_xyz --file ops.yaml --if-revision 7
```

`POST /v1/drafts/:id/apply-yops` requires an `if_revision` for optimistic
locking. When `--if-revision` is omitted, the CLI fetches the draft first,
reads its current `revision`, and applies — two round-trips but zero
arguments to think about.
