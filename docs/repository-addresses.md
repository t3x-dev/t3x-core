# Repository addresses

Repository addresses use `/{namespace.slug}/{project.name}`. `project_id` remains
the stable identity. Naming policy belongs to the application package; the API
normalizes proposed names and the WebUI displays that result before submission.
Case and `.`, `_`, `-` are preserved. Names are 1–100 ASCII characters, require a
letter or digit, and cannot be `new` or `settings` (case insensitive).

## API contract

- `GET /api/v1/repository-name?namespace=owner&name=input[&project_id=id]`
  returns the final `name`, `changed`, `valid`, `available`, `code`, `message`,
  `namespace`, and preview `canonical_path`. Availability is advisory. Creation
  requires namespace creation authority; a rename requires project edit authority.
- `GET /api/v1/repositories/{owner}/{name}` resolves an exact current or historical
  claim, then checks project read authority. It returns `project_id`, current
  `name`, `namespace`, `canonical_path`, `path_status`, and `redirect`.
- Project list/detail/create/update/restore responses include `namespace`,
  `canonical_path`, and `path_status`. A pending migration has a null path.
- Project update uses `PUT /api/v1/projects/{id}`. Invalid names return 400;
  occupied current/historical names return 409 `NAME_OCCUPIED`. Conflicts reveal
  no other project's identity or metadata.
- `GET /api/v1/projects` defaults to `status=active`. `status=deleted` lists
  soft-deleted repositories the current principal can restore or delete, with
  `deleted_at`, `can_restore`, and `can_permanently_delete`. Namespace filtering,
  offset pagination, and cursor pagination apply before returning records.
  Deleted-list responses echo `status: "deleted"`, including empty pages, so
  clients can reject older servers that ignore the requested status. The WebUI
  also requires deletion timestamps and explicit action capabilities on every row.
  The canonical path describes the reserved address, not an accessible page.
- `DELETE /api/v1/projects/{id}` soft-deletes the repository, keeping its data,
  identity and all address claims. Ordinary reads and address resolution exclude
  deleted repositories. `POST /api/v1/projects/{id}/restore` restores that same
  identity and its aliases, subject to current restore authority, name constraints
  and host admission policy. It never creates a replacement or silently renames.
- `DELETE /api/v1/projects/{id}?permanent=true` irreversibly deletes the repository
  and releases all linked current, renamed and transferred addresses. Each name
  can then be claimed by a new repository with a different `project_id`. An old
  address bookmark can consequently resolve to that new repository; old ID links
  and the deleted repository's permissions do not transfer. There is no timed
  purge or automatic deletion of soft-deleted repositories.
  The deleted-list UI also sends `only_if_deleted=true`: the delete statement
  checks the current deleted status atomically and returns
  `409 REPOSITORY_STATE_CHANGED` if the repository has been restored meanwhile.

The namespace directory exposes **Deleted repositories** at the bottom of the
page (`?view=deleted`). Recovery preserves visibility and offers the restored
repository's canonical address. Permanent deletion requires typing the complete
`namespace/name`; uncertain outcomes require refreshing the list before retrying.
Deleted entries are paginated and use the server's action capabilities.

## Storage and migration

Schema version 76 adds `repository_paths`. Its primary key is
`(namespace_id, name_key)` where the key uses ASCII case folding. Current names,
previous names, and previous ownership addresses all point directly to
`project_id`. There is no redirect chain. Project triggers atomically claim a
path on insert, rename, namespace transfer, or restoration. A competing claim
fails the transaction. Soft deletion retains claims. Schema version 77 changes
the project foreign key from `ON DELETE SET NULL` to `ON DELETE CASCADE`, so
permanent deletion releases all linked claims in the same transaction. Existing
transfer permissions and lifecycle policy still run.

Existing null-owner records are retained, whether resolvable or not. They can
represent old permanent deletions or blocked migration candidates; the stored
shape does not establish their origin. No automatic cleanup is performed. Review
the read-only inventory before any separate, evidence-backed remediation.

The migration locks project writers while inventorying names. It never renames
projects or assigns missing namespaces in a v75 upgrade. Unique valid names get
resolvable claims. Unique abnormal candidates reserve a name for their own
project, but are not resolvable until explicitly renamed to a valid name.
Ambiguous candidates get blocked claims with no project owner. This permits the
schema migration to finish even when historical data needs human review.

The migration entry point also repairs the known early local v76 table shape
that lacks `resolvable`. It enables only unambiguous, unchanged current names
owned by the matching project. Uncertain historical candidates stay reserved
and unresolved pending review; it does not guess ownership or rewrite names.

Build the application and storage packages before using these commands. Inspect
the intended database first, using a read-only connection when available:

```sh
DATABASE_URL="$INSPECTION_DATABASE_URL" node tools/audit-repository-names.mjs > /tmp/repository-name-audit.json
```

The tool uses a read-only repeatable-read transaction and never starts a server,
bootstraps a database, or writes data. The report includes every project,
including deleted projects, proposed names, reasons, normalized conflict IDs,
namespace problems, and whether a canonical path can be established. `claims`
also inventories every current/historical claim, including detached records that
have no project row. `unattributed_claims` lists unknown-origin or missing-project
claims with action `retain`; candidate project IDs are clues, not ownership proof.
Keep reports outside Git.

After operator review and deployment coordination, the existing migration entry
point applies schema 77 using a migration-owner connection:

```sh
DATABASE_URL="$MIGRATION_DATABASE_URL" node --input-type=module -e 'import { migratePostgresStorage } from "./packages/storage/dist/postgres.js"; console.log(await migratePostgresStorage({ connectionString: process.env.DATABASE_URL }));'
```

This is a preparation/usage instruction, not evidence that a database was
migrated. Runtime PostgreSQL startup remains read-only schema validation.
Embedded bootstrap follows the existing explicit local bootstrap behavior.
Rerun the audit after migration. Human decisions still include choosing valid
names, resolving ambiguous candidates with distinct new names, and assigning
missing namespaces through the existing authorized ownership process. Only future
permanent deletions release their linked names; ambiguous legacy claims are not
recycled and no automatic random suffixes are generated.

## Web compatibility

The owner/name route resolves directly through the API, independently of project
lists or pagination. Case differences and all historical names redirect to the
current canonical path. Supported ID routes also redirect, preserving query
parameters and fragments: repository tabs, settings, history, diff, merge, leaf,
knowledge graph, workspace change review, and conversation source evidence.
Nested business pages are reused with a route-parameter adapter.

Unknown ID suffixes stay under the ID route. Retired commit and draft routes
retain their existing not-found behavior. Pending-migration repositories remain
accessible by ID with a visible notice. Missing namespace and the display label
`You` are never used to invent an address.
