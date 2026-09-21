# Firebase Hosting + Cloud Run migration

NestFinance is migrated conservatively: Firebase Hosting serves the SPA and forwards only the **currently public** API paths to one Cloud Run service. Existing Vercel gateway handlers remain the business-logic source of truth.

## Target

- Firebase project: `millionsnest`
- Hosting target: `nestfinance`
- Hosting site: `mn-nestfinance-555464791734`
- Cloud Run service: `nestfinance-api`
- Domain after cutover: `nestfinance.millionsnest.com`

## Compatibility boundary

The Cloud Run adapter exposes exactly the API routes currently present in `vercel.json` and delegates to `api/auth-gateway.ts`, `api/finance-gateway.ts` and `api/system-gateway.ts`. Internal gateway operations that are not currently public are intentionally not exposed.

## Firebase Admin

Vercel can continue using the existing explicit service-account environment variables during rollback. Cloud Run uses Application Default Credentials through its runtime service account; no private key is baked into the image.

## Production release

The canonical production path is the atomic workflow `.github/workflows/nestfinance-production-release.yml`.

- A merged pull request whose base is `production` starts the atomic release.
- Closing a production pull request without merging never deploys.
- `workflow_dispatch` remains the explicit manual fallback.
- The release re-certifies the exact production commit, deploys Firestore indexes/rules, publishes the exact-SHA Cloud Run image, deploys Firebase Hosting and verifies the same SHA through the public Hosting route.
- Direct push is not a second deployment trigger, avoiding duplicate releases for the same promotion.

## Non-regression rules

- Firestore Rules and indexes are untouched by the migration contract outside the certified production release stages.
- `organizationId` and `financeEntityId` remain security boundaries.
- Idempotency, posting safeguards, allowlists, Handoff and RBAC are not rewritten.
- Vercel remains manual-only until Firebase smoke tests and domain cutover are complete.
