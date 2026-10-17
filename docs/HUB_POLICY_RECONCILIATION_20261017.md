# Canonical shared policy reference reconciliation — 2026-10-17

The Finance release for PR #307 failed at `NESTFINANCE_SHARED_FIRESTORE_HUB_POLICY_DRIFT` (run 39048679014). Its read-only guard expected the previous canonical Hub source, SHA-256 `277e117297a140c0d621286962efbd8552b10567571c5174e9601c3ba6f80ae5`, from Hub commit `8fef455aaeb091b22248bb0526522b008dfaa546`.

## Verified source and publication

- Hub PR #401 merged source `c4ad2176ad93b376d3343adf327445869afbdbc8`.
- Compared with the previously pinned policy, the only Rules change is a 59-line NestJourney `/teamInterests/{interestId}` match block. No Finance, MusicScale or Connect rule is changed by that diff.
- This collection represents staff interest intake, not a membership or authorization grant. Reads require canonical Journey implementation/congregation scope. Creates require tenant and scope validation, bounded fields, allowed areas and actor/time binding. Updates preserve tenant, congregation and creation attribution and require authorized scoped management; delete is denied.
- Scope-limited review: update validates the changed-field allowlist and allowed areas, but does not reapply every create-time string-size/type check. That is a Journey data-quality hardening item, not a Finance authority change. No claim of full cross-product Rules certification is made by this reference update.
- Hub production commit `2a438b34805598e22a4c6e92771c69d4c513b989` contains the identical Rules source, SHA-256 `1730f4714c72a835f4db8d2a084ece2c917d81ac69d5ed32d6d45649c9268c58`.
- Canonical publication run https://github.com/prdanielcunha/millionsnest/actions/runs/39040061658 succeeded. Job `117417525050` logged the exact published hash, `MILLIONSNEST_FIRESTORE_RULES_DEPLOY_OK`, and `CONNECT_ACTUAL_PUBLISHED_PRIVATE_STORAGE_PROOF_OK`. Journey, Connect, MusicScale and NestAffiliate boundary gates passed in that run.

## Finance change and release constraints

Only the expected hash in the existing read-only release guard and its policy regression test change. The guard still rejects any other deployed source. Finance does not deploy shared Rules or indexes, expand IAM, change authorization, migrate customer data or enable posting/Count/AI flags.

Production ancestry is reconciled by a normal merge with both parents, preserving current main content. The dispatcher add/add conflict retains main's existing path-limited bootstrap trigger, which runs only on main and preserves the protected production worker and its runtime gates.

Publish through the existing tested PR/release pipeline. Confirm canonical live SHA and unauthenticated login rendering after deployment. The release workflow retains traffic/Hosting rollback. This reconciliation does not complete E01–E08: financial posting, verified opening balances, settlements, formal close and authenticated visual certification retain their separate gates.
