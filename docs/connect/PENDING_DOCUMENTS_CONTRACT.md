# Connect pending document summary

`POST /api/finance-gateway?operation=connect-pending-documents`, Bearer Firebase identity and `x-organization-id`, body exactly `{ financeEntityId }`.

Delegates unchanged Universal Evidence authorization: revoked token check, canonical Hub ecosystem access, current organization/member entitlement, `finance.view`, active finance entity and member entity scope. A bound Finance handoff cannot be retargeted. Connect must supply a canonically selected entity; no selector bypass or Connect-generated Finance identity claims.

Success: `{ schemaVersion: 1, summary: { awaitingUpload, needsClassification, pendingReview } }`. Counts retain existing Universal Evidence definitions. No amounts, names, filenames, documents, Storage paths, IDs or binaries. No new posting/AI/OCR/read authority. The underlying existing read executes its own bounded evidence query/aggregations; no business rule is copied.

Errors preserve canonical HTTP status but return generic context-unavailable codes. `Cache-Control: no-store`. Not deployed or consumed by a Connect Tool Gateway adapter until PR/release gates pass. Real cross-app authenticated QA remains pending.
