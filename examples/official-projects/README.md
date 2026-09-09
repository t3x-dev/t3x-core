# T3X project examples

Original Apache-2.0 examples with author introductions, avatars and two sample
revisions. They use the existing project, CommitV2 and presentation APIs.

Preview the import without making requests:

```sh
node tools/official-projects.mjs
```

An operator with project creation access to the reserved `t3x-dev` organization
can import them. The default target is localhost. For an authenticated host, use
`T3X_TOKEN` and an HTTPS `--api` URL ending in `/api/v1`.

```sh
node tools/official-projects.mjs --apply --receipt /tmp/t3x-project-receipt.json
```

Keep the receipt outside source control. Rerunning with the same receipt resumes
incomplete presentation uploads and skips completed commits. A changed ref stops
the import. If creation succeeded but its response was lost, inspect the existing
project before retrying; the importer refuses to adopt a matching name automatically.

Projects are created private. Publishing, catalog linkage and schema binding are
separate actions. The companion schema reference is informational until explicitly
bound. T3X avatars identify the author; they do not grant an official verification
badge. No model, container or deployment is executed by this importer.

Only mapping-root examples are supported by this initial semantic-content import.
Native documents with scalar roots and complete Skill file bundles must use a
lossless adoption path; do not convert them through this importer.
