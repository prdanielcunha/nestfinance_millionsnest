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

## Non-regression rules

- Firestore Rules and indexes are untouched.
- `organizationId` and `financeEntityId` remain security boundaries.
- Idempotency, posting safeguards, allowlists, Handoff and RBAC are not rewritten.
- Vercel remains manual-only until Firebase smoke tests and domain cutover are complete.
