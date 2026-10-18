# Audited corrections — delivery boundary

The enabled legacy Count result screen now offers finance managers an explicit correction form and a before/after history. This is not the hidden Count v3 feature.

- Mandatory trimmed reason, 10–500 characters, enforced server-side.
- Changing a positive category to zero (including removing it through the API) requires an explicit category-level zero confirmation, enforced both in the screen and server-side. A blank/deleted amount alone is not consent to record zero.
- Canonical `finance.manage`, organization/entity isolation, expected version and actor-bound idempotency.
- One count is corrected at a time. The correcting actor must differ from the other preserved counter; comparisons are recalculated, not manually marked approved.
- Every correction preserves the entire original count, complete replacement, reason, verified actor, server-owned timestamp and version transition. The canonical audit uses create-only writes in the same transaction as the correction; cross-app facts exclude private amounts and reasons.
- The result screen shows per-category original/final amounts, totals, responsible person, local date/time and reason. Blind independent stages redact all correction history alongside original count material.
- Recounts also require a reason. Their audit records preserve both original count records and the submitted recount values; completed history shows the reason, original totals and final recount total.
- Existing proposals, treasury progression, reconciled/deposited/closed source records cannot be overwritten by this operation. These require a separately certified linked financial adjustment. This slice does **not** implement posted-transaction reversal or formal monthly close/reopen, and does not claim those features are usable.
- No posting flag, OCR/AI, account balance, journal, existing financial transaction, shared Rules or indexes are modified by this slice.

## Canonical release fingerprint

Hub production PR408, commit d91b2d1d513a7a25a7f97b8d4b8238d6c95b24c1, was published by run 39091831513 / job 117570025604. The job succeeded and reported the exact candidate and published SHA-256 `6835b7c1d5d520e7446b41469ecf008f09e232fb40c1723a4dd8551465659f43`, `MILLIONSNEST_FIRESTORE_RULES_DEPLOY_OK` and `CONNECT_ACTUAL_PUBLISHED_PRIVATE_STORAGE_PROOF_OK`. Finance updates only its read-only fingerprint guard, preserving the shared Rules ownership contract. Hub's unrelated application deployment was skipped.

## Verification

`scripts/test-count-corrections.ts` checks reason bounds, pure preparation, state/version/independence guards, linked-finalization boundaries and history redaction. `scripts/test-count-corrections-emulator.ts` runs only against a loopback demo emulator and exercises real atomic writes, simultaneous idempotent retries, structured original/final evidence, authoritative actor/time, RBAC, cross-entity denial, blind history and zero ledger effects. The dedicated quality workflow runs these plus typecheck, both bundles, API contracts and existing Count role-boundary tests.

Real signed-in desktop/mobile visual acceptance and the full app's posted correction/formal-close gates remain separate requirements. Do not describe the complete 32-screen app as finished on the basis of this delivery.
