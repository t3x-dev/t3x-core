# Conversation-adjacent API contracts

`conversation-contract-inventory.json` is the migration ledger for issue #1296. It separates four things that used to be bundled under “Chat”:

- Generation is a reusable capability.
- Source Thread is durable source data and immutable turns.
- Repository Review owns proposals, validation, decisions, and commits.
- Legacy Conversation Workflow is compatibility surface with an explicit exit condition.

Every exact route in the audited capability modules inherits an owner, compatibility state, consumer set, and removal gate from its contract. Cross-cutting route modules that only carry conversation provenance are listed separately so a conversation reference is not mistaken for legacy product ownership.

The contract test fails when:

- an audited route is added or removed without updating the inventory;
- a conversation-aware route module is not classified;
- a declared consumer or source file disappears;
- a deprecated client symbol gains a new first-party caller; or
- a compatibility contract has no removal gate.

Known mismatches between a typed client and the implemented API are recorded as `known_contract_gaps`. A gap must name its live consumer and resolution gate. The test also requires the expected route to remain absent, so implementing it forces the inventory to be updated rather than leaving stale debt documentation behind.

`compatibility` means the route still has a named consumer or external compatibility obligation. `removal_candidate` means no product behavior is allowed to depend on the route; an exported adapter alone is not evidence of a live consumer.

This inventory controls migration, not runtime authority. Authentication, project access, evidence verification, and repository decisions remain server-owned.
