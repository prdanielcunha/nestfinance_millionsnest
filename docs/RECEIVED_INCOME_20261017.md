# Received income by payment date — 17 October 2026

Reports now has a church-scoped receipt view with inclusive start/end calendar dates, cash, Pix, credit card, debit card, incoming bank transfer and other methods. Daily composition is expandable. PT/EN/ES, keyboard focus, named fields and 56px primary controls follow the existing foundation.

`received-income-summary` resolves canonical authenticated finance access and entity scope on the server. Count-only users remain denied by the existing read boundary. Responses have `private, no-store`. No personal names, account IDs or raw transaction IDs are returned. No financial write or paid service is performed.

The source is canonical transactions, never counts plus transactions plus documents. Internal transfers, reversed entries, expenses and adjustments do not enter income. Posted and pending totals remain separate. Duplicate active Count source dimensions are excluded with an explicit incomplete result; same-value gifts without a shared Count source are not heuristically discarded. Unsupported currency and invalid records prevent a complete claim.

Dates use `occurredAt`, checked against evidence or manually entered by the operator, using the server-owned organization timezone. Historical Brazilian organizations without timezone use America/Sao_Paulo. Upload/recording dates do not change the financial period. This is not automatic evidence verification.

Count v3 requires explicit `receivedDate` for digital totals when preparing treasury drafts; physical cash defaults to service date. The selected date becomes `occurredAt` while original `serviceDate` remains in provenance. Idempotency hashes include the submitted date; changed-date replay cannot create new income. Historical transactions are not rewritten. Mixed-date digital receipts must be recorded individually without repeating the same amount in Count drafts. Splitting one sealed aggregate into multiple dated parts remains pending.

## Limits and remaining specification work

- This does not certify all 32 screens or E01–E08.
- Posting and formal monthly close remain disabled. Pending income is not confirmed balance.
- Sources above 5,000 entity transactions are rejected rather than returning partial totals. A certified paged aggregate is still needed for larger histories.
- Card settlement schedules, partial settlements, fees and receivables are not implemented here; operators enter actual receipts, not future card money.
- T01–T32 still require authenticated device/visual QA, certified posting/reversal/opening effects, payments/partial settlements, remittance execution and official close/accountant coverage.
- Shared Firestore Rules/indices, Auth/Hub, flags and client data are unchanged.

## Validation

- Domain: `node --import tsx scripts/test-received-income.ts`.
- Count regression: `test-count-v3-draft-plan.ts`, `test-count-v3-transaction-drafts.ts`.
- Firestore integration: `test-count-v3-drafts-firestore-emulator.ts` now covers Pix on a different day, cash on service day, summary handler, entity isolation, missing auth and changed-date replay.
- Java 21 CI: `.github/workflows/nestfinance-received-income-quality.yml`. Local Java 17 cannot start the emulator; do not claim this gate passed until CI confirms it.
- Typecheck, SPA/API builds, API contracts, isolation/role gates and roadmap cycles must pass on the submitted SHA.

Rollback: normal code revert; no data migration required.
