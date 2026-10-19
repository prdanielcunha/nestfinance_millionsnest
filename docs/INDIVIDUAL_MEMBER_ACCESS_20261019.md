# Individual NestFinance access

The canonical Hub remains the only member-access authority. The opt-in `finance.access.individual_v1` marker is written only when an authorized person explicitly saves the member editor. Existing memberships are not migrated automatically. Marked memberships use explicit permissions instead of organizational/job-title inheritance; canonical global authority remains unchanged.

- Count execution grants dedicated Count permissions and technical Count reads, never generic treasury drafts. Legacy Count endpoints translate their draft requirement only for trusted server-resolved Count operations. Register-only membership cannot execute Count mutations.
- Treasury reads require `finance.treasury.view`; balance visibility additionally requires `finance.balance.view`. Balance and Count can be combined without giving generic draft authority. Catalog reads remain separate from bootstrap application; applying setup requires `finance.manage` through the canonical request context.
- The Hub command verifies active actor/target/organization, existing app entitlement, canonical financial/member-management authority and entity scopes inside a transaction. It preserves other apps, roles and scopes, checks the expected access revision, records before/after and reason, and increments the canonical session version. Self edits and attempts to restrict global authority are rejected.
- Permissions use plain PT/EN/ES wording. More → Your access explains the canonical team-management location. Compact navigation remains through 1023px, preserves device safe-area space and scrolls the context sheet; desktop navigation starts at 1024px. Themes use the existing token system.

## Verification and deployment order

Firestore emulator tests cover canonical resolution, Count/treasury separation, combinations, role non-escalation, scope, stale sessions and actual bootstrap-mutation denial. Hub emulator tests cover command authorization, input validation, non-escalating legacy projection, optimistic revisions, audit, session invalidation and preservation. Dedicated CI repeats the emulator tests. Existing frontend, theme/accessibility, Count boundary, role/workspace, TypeScript and production builds remain required.

Publish the access-aware NestFinance server before the Hub editor. Publish the same feature to Hub main and production without overwriting unrelated existing Hub differences. Recheck exact production code, release endpoint and unauthenticated denial. No real member grants or financial records are changed by this engineering release.

Before publishing the editor, canonical Hub security PR417 closes overlapping
Rules writes to root identity and memberships, protects lifecycle/session
authority and prevents client tampering with access-change audit evidence.
Certification includes 114 denied tampering operations and cross-product Rules
gates. The Finance release keeps an exact read-only fingerprint of the certified
Hub publication, documented in `HUB_RULES_BASELINE_20261019.md`; it never deploys
its own shared Rules or accepts an arbitrary live hash.

## Rollback

Prior NestFinance production is `2dcb9c3bf70c3fccf2e86bef5037f9b619f5f835`. Before any individual membership is saved, ordinary release rollback is possible. **After the first real individual grant, rollback must preserve the individual-access-aware server.** A legacy server ignores the marker and can restore broad role inheritance. Use a compatible fix-forward/revision; disabling the editor alone does not make a legacy rollback safe. Any restoration of prior memberships requires an explicit, audited procedure. The Hub editor can be rolled back independently while retaining the new NestFinance enforcement.

Browser access to the isolated visual preview is currently unavailable. Source/SSR, theme and accessibility checks are engineering evidence, not a claim of visual acceptance or testing on physical iOS/Android devices.
