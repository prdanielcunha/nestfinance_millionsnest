# Ledger lifecycle — work in progress

This branch continues the E02 domain/atomic adapter from draft PR316 on the current integrated Finance source. The complete app is not certified by this checkpoint.

Implemented internal boundaries:

- Explicit initialization preview and confirmation against the exact source catalog, with a reason, versioned persisted mappings, scoped idempotency and immutable audit. Previously posted/reversed transactions or journal history require a migration review. Opening amounts remain unknown; initialization never supplies zero.
- Approvals for an initialized book read the actual persisted references in the database transaction. Preview-generated mapping identifiers cannot authorize execution.
- Count-backed income revalidates the sealed session, distinct independent counters or v3 treasury authority, source version, assignment, amount, method and actual received day. A private proof is bound to the approval and rechecked before posting.
- Posted journals carry a content-integrity proof. A reversal preserves the original journal, writes inverse debit/credit lines and signed movement effects, advances the period version and records the original/final transaction states, verified actor, server time and mandatory reason atomically. Bank reconciliation must be undone first; the original accounting period must be open.
- Replays and competing writers are covered by the source version, database transaction, deterministic journal identities and actor-scoped idempotency. Financial facts use command identity instead of a potentially reused client correlation ID.

These methods are internal. Public commands, configuration UI, linked replacement drafts, period close/reopen, verified opening balances, protected read models and the complete operational journeys still require integration and certification. The production posting flag remains disabled. No existing production records, Rules, IAM, indexes or billing settings are changed by this checkpoint.

Local validation: typecheck, posting domain (four balanced flows and 33 rejection/integrity cases), existing posting-plan/journal tests and lifecycle unit tests. The dedicated Java21 demo-emulator workflow also exercises the real initialization→fresh approval→posting path, five posting/reversal cases, concurrent replay and atomic rejection paths. Its actual result must be checked before marking the persistence changes verified.
