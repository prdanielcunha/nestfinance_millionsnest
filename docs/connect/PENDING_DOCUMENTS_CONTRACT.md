# Connect pending document summary

`POST /api/finance-gateway?operation=connect-pending-documents`, Bearer Firebase identity and `x-organization-id`, body exactly `{ financeEntityId }`.

Connect sends the same transient Firebase bearer in `Authorization` and `X-Connect-User-Authorization`, matching the existing MusicScale transport. Only this operation accepts the alternate header when a Hosting/Cloud Run boundary consumes Authorization. A supplied forwarded value takes precedence and must be a single bounded Bearer string; invalid/multiple values fail401. It is still untrusted input: the unchanged canonical delegate verifies the selected Firebase token with revocation, then Hub/RBAC/tenant/entity scope. No transport header confers authority. No tokens are stored or logged. Authenticated cross-app delivery remains a release gate, not established by unit tests.

Delegates unchanged Universal Evidence authorization: revoked token check, canonical Hub ecosystem access, current organization/member entitlement, `finance.view`, active finance entity and member entity scope. A bound Finance handoff cannot be retargeted. Connect must supply a canonically selected entity; no selector bypass or Connect-generated Finance identity claims.

Success: `{ schemaVersion: 1, summary: { awaitingUpload, needsClassification, pendingReview } }`. Counts retain existing Universal Evidence definitions. No amounts, names, filenames, documents, Storage paths, IDs or binaries. No new posting/AI/OCR/read authority. The underlying existing read executes its own bounded evidence query/aggregations; no business rule is copied.

Errors preserve canonical HTTP status but return generic context-unavailable codes. `Cache-Control: no-store`. Not deployed or consumed by a Connect Tool Gateway adapter until PR/release gates pass. Real cross-app authenticated QA remains pending.

Scoped publication uses a production PR titled with [connect-summary-api-only]. It preserves the production functional gate, refuses wider changes/unreviewed handler hashes, skips Firestore rules/index deployment, updates only the image and release-SHA metadata, compares all runtime configuration/IAM, and restores previous traffic/Hosting after failure. Existing canonical identity/entity authorization and no-posting behavior remain unchanged. Canonical 401 smoke proves denied access only; real-account financial scopes require independent integration evidence.
