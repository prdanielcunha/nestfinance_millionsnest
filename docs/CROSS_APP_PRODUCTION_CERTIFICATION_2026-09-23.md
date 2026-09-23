# Cross-App Production Certification — 2026-09-23

## Scope

Certification boundary: MillionsNest Hub → NestFinance authentication, organization binding, revocation, antiabuse, audit and session lifecycle.

## Production baselines verified before this closing slice

- Hub production: `92d3f52578e1b94db37fc08371cd60376506dec2`.
- NestFinance production: `714396669eb6c87ed20623134b572e79639f1180`.
- NestFinance exact running SHA is exposed by `/api/system/release` and is checked by the release workflow after Cloud Run and after Firebase Hosting propagation.

## Required behavior matrix

| Scenario | Certified by |
| --- | --- |
| Canonical Hub launcher binding | Hub `test_nestfinance_handoff_contract.ts` + NestFinance handoff binding tests |
| Wrong app/version/organization | `test-handoff-token-binding.ts` |
| Missing/stale session version | `test-ecosystem-session-resolver.ts`, `test-handoff-session-enforcement.ts` |
| Global CEO/founder access | `test-ecosystem-session-resolver.ts` |
| Membership/appAccess denial | `test-ecosystem-session-resolver.ts` |
| Direct Google entry | `test-direct-entry-session-version.ts` |
| Organization switch session binding | `test-direct-entry-session-version.ts` |
| Legacy one-time-code happy path | `test-handoff-redeem-security.ts` |
| Legacy replay rejection | `test-handoff-redeem-security.ts` |
| Origin rejection | Hub `test_handoff_security.ts` + NestFinance `test-handoff-redeem-security.ts` |
| Durable rate limiting | Hub `test_handoff_security.ts` + NestFinance `test-handoff-redeem-security.ts` |
| Durable audit | Hub `test_handoff_security.ts` + NestFinance `test-handoff-redeem-security.ts` |
| Finance org retarget rejection | `test-finance-request-context.ts` |
| Logout / return to Hub / revoked-session recovery | `test-ecosystem-session-lifecycle.ts` |
| Exact production artifact | `NestFinance Production Release` |
| Cloud Run + Hosting + canonical domain | `NestFinance Production Release` |

## Gate

NestFinance consolidates the local side of this matrix in:

```bash
npm run test:cross-app-final-certification
```

The production release also runs this bundle before image publication.

## Explicit non-goals

- No real posting is enabled by this certification.
- App Check is not claimed as implemented.
- No raw one-time code or raw UID is added to durable audit records.
- This certification does not replace server-side RBAC or Firestore Rules.

## Protocol status

- `ecosystem_ctx`: canonical Hub launcher protocol.
- one-time code: supported fallback v1.
- removal of the fallback requires a separate, explicit migration release.
