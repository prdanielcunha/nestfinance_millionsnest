# Audited transaction edits

This slice completes original/final evidence for editing draft movements, including movements returned after review or approval. It does not implement correction of posted journal entries, reversal, definitive monthly close/reopen, account opening balances or full app certification.

- The canonical server resolver enforces token revocation, bound organization, capability and entity scope.
- Reviewed/invalidated drafts require a trimmed reason of 10–500 characters at the server and both edit screens. Reasons are optional for an initial draft; any supplied reason has the same bounds.
- Each material edit atomically creates a private audit with the complete original/final transaction and allocations, plus a create-only scoped correction record. Actor identity/name and time are server-owned.
- The default detail shows original/final amounts, changed fields, verified name, local date/time and reason in PT/EN/ES. It explicitly limits the view to the latest 20 records; prior records remain stored. The bounded presentation snapshot is not the complete private audit.
- Idempotency binds transaction identity, expected version and full submitted material. Retries do not create another correction; concurrent editors cannot overwrite newer versions.
- Posting/reversal and active bank reconciliation evidence remains immutable even on an inconsistent document labelled draft. Corrections of those records still require the certified financial reversal/adjustment workflow.
- Existing allocation IDs must belong to this transaction; partial edits retain their allocations. No posting, journal, balances, shared Rules, paid processing or feature-flag activation occurs.
- Existing pre-release edits cannot be reconstructed retroactively. No historical values are fabricated.

## Verification and rollback

Local typecheck, both bundles, API contracts, SaaS isolation, guided edit (47 checks), transaction integration (10 checks), search/audit and pure correction-domain checks. A dedicated Java21 demo-emulator workflow proves atomic original/final storage, required reason, authoritative actor/time, history DTO, replay, concurrent edits, token revocation, organization binding, RBAC, entity isolation and absence of ledger writes. Existing real Firestore transaction journey receives the required reason in its concurrent correction scenario.

An unrelated legacy material-mutations test currently seeds noncanonical authorization and fails in its existing create/preview paths; it is not used as passing evidence. Exact-head CI and independent review are required before merge. Authenticated visual/device acceptance remains unverified.

Rollback uses the existing configuration-preserving production pipeline to the preceding certified release. Created audit/correction records remain preserved; no migration or deletion is required. Old clients cannot silently bypass the new reason requirement on reviewed drafts.
