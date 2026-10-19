# Balance visibility

The Today balance requires the canonical `finance.balance.view` capability.
As with other finance capabilities, canonical full administrators, global access,
`*` and `finance.manage` include it. Count-only and team-only restrictions remain
stronger than organizational role labels. A church title alone is not a grant.

`finance.view`, recording drafts, and reviewing transactions do not by themselves
grant balance visibility. Unauthorized summary responses return a restricted
state with a null amount; balance queries are skipped. Account catalogs omit
opening amounts and declarations. Opening history additionally requires balance
access. Both Today presentations hide the balance and calculation details when
the client or server denies it; permission is not a cosmetic eye toggle.

More shows current access in plain PT/EN/ES language. This panel is read-only.
An individual member permission editor remains a Hub responsibility and is not
implemented by this slice. No membership grants, financial records, shared Rules,
IAM, posting flags or production data are changed by the release.

Verification: SSR checks restricted HTML in all three languages, including a
stale authorized snapshot. The existing Today Firestore emulator integration
tests real canonical memberships, explicit balance access, revocation, full
administrators, entity scope, Count/team restrictions and opening read endpoints.
