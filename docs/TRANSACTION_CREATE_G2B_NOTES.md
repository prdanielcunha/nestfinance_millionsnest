# Transaction Create 2.0 — Phase G2B

This phase changes the presentation and guided interaction of transaction creation while preserving the existing accounting/backend contract.

Certified invariants:

- Supported directions are allow-listed and invalid query values fall back to `expense`.
- Stored monetary values remain integer BRL cents; only presentation follows the active PT/EN/ES locale.
- Existing `finance.create_drafts` and `finance.submit_for_review` capability gates remain in place.
- Draft and create+submit operations keep idempotency reuse for identical material payloads and rotate when financial material changes.
- Entity epoch protection still ignores stale responses after an entity switch.
- Classification and evidence/details use progressive disclosure while required blockers can be surfaced from readiness.
- No posting, journal, aggregate, balance, production-deploy, Hub identity, or entitlement behavior is introduced or modified here.
- Real posting remains disabled.
