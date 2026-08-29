# Cloud Sync Candidate Automation

The `Cloud Sync Candidate` workflow converts an accepted Core `dev` revision
into a reviewable branch from `t3x-dev/t3x-cloud` `dev`. It deliberately stops
before creating a pull request. Cloud review and merge to `dev` qualify the
staging deployment; the explicit `dev` to `main` promotion remains the separate
production gate.

## Repository setup

Configure the Core Actions secret `CLOUD_SYNC_TOKEN` with the minimum access
needed to read and push branches in `t3x-dev/t3x-cloud`. Prefer a GitHub App
installation token or a fine-grained token restricted to that repository with
`Contents: Read and write`. The workflow does not need pull-request,
administration, environment, or deployment permissions.

## Result

Relevant pushes to Core `dev` produce an immutable Cloud branch named from the
full source identity, for example `sync/core-e05165ed747e`. The workflow:

1. packs the exact internal Core packages consumed by Cloud;
2. updates `vendor/t3x/manifest.json`, package pins, and the lockfile;
3. synchronizes the shared Web baseline while preserving Cloud overlays;
4. refreshes Cloud's exact Core artifact and PostgreSQL compatibility contract;
5. verifies artifact hashes and Web drift;
6. pushes the candidate branch and prints a `dev` PR link for a human to open.

If the branch already exists, the workflow never force-pushes it. Delete an
abandoned candidate branch before intentionally regenerating it.

Manual workflow runs are also restricted to the `dev` ref, so an unreviewed
feature branch cannot be turned into a Cloud candidate through this workflow.

Merging the manually opened Cloud PR to `dev` remains the staging deployment
trigger for Vercel and for Railway when API watched paths changed. Promotion
from `dev` to `main` is manual and owns production deployment. Deployment smoke
evidence is owned by the Cloud pipeline, not this synchronization workflow.
