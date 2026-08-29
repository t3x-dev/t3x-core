# Namespace authority v1 contract

Status: contract and fixture baseline for `t3x-core#1417`. This does not apply a
database migration or change the current route evaluator.

## Ownership law

One canonical `namespace_id` owns each project. Current stored namespace membership or
project-scoped grant authorizes a principal; `projects.owner_id` becomes historical
creator/provenance after migration and is not a second permission engine.

OAuth accounts remain provider login links. They are not namespace membership or billing
accounts. Plan, price, paid-seat, provider-secret, Stripe, credit, and managed-spend fields
do not belong in Core identity tables.

Authority is loaded from storage by the server. Client namespace IDs and role claims,
default/global namespace slugs, owner-null rows, archive provenance, and JWT role hints
never grant access. Explicit AUTH_DISABLED local mode remains an adapter-level bypass and
does not enter this evaluator.

## Namespace role matrix

| Action | Owner | Admin | Editor | Viewer |
| --- | ---: | ---: | ---: | ---: |
| Read namespace/project | Yes | Yes | Yes | Yes |
| Read member list | Yes | Yes | Yes | No |
| Create/edit project | Yes | Yes | Yes | No |
| Update namespace | Yes | Yes | No | No |
| Delete/restore project | Yes | Yes | No | No |
| Manage members/invitations/project guests | Yes | Yes | No | No |
| Transfer project | Yes | Yes | No | No |
| Transfer namespace ownership | Yes | No | No | No |

Last-owner protection, ownership transfer, invitation acceptance, and membership mutation
require transactional application functions in later slices. The matrix alone does not
perform those operations.

## Project grants and credentials

Project grants are isolated from namespace membership:

- project viewer: read that project;
- project editor: read/edit that project;
- project admin: read/edit/delete/restore and manage that project's guests;
- no project guest may transfer a project or gain other namespace projects.

Every API key or machine credential is an additional restriction, never an authority
expansion. Machine principals require an exact project binding and explicit project-action
scope. A credential cannot inherit its human creator's broader namespace role.

## Legacy mapping

Migration inventory must classify every current project before writing:

1. An exact personal namespace/owner match maps deterministically.
2. An owned project in the known legacy/default bucket maps to that owner's unique personal
   namespace; the default slug grants nothing.
3. An organization project maps only when its historical owner has current stored
   organization membership.
4. Owner-null rows, unknown namespaces, missing personal namespaces, personal-owner
   mismatches, and organization rows without membership are quarantined and fail closed.

Migration preserves the historical creator and payer/audit provenance. It does not create
memberships, invitations, grants, billing accounts, or AI allowances from an archive or
ambiguous legacy row.

## Delivery sequence

1. This contract, DTOs, matrices, deterministic mapper, and fixtures.
2. Reviewed schema/migration under the explicit migration runner from `#1420`.
3. One canonical repository/application authority evaluator used by HTTP, WebSocket, MCP,
   automation, and shared WebUI DTOs.
4. Transactional invitation, membership, last-owner, grant, and transfer lifecycle.

Cloud consumes this reusable collaboration authority and separately intersects commercial
entitlement and spending policy. Cloud must not create a parallel organization/member store.
