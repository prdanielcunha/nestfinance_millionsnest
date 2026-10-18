# Full release configuration preservation — 18 October 2026

PR312 passed all 35 candidate workflows, but release run 39076338357 stopped before image publication or service mutation because the shared Hub policy fingerprint had changed. Traffic/Hosting restoration succeeded; the live API still reports edebb7b26c91. This was a release failure, not a successful publication.

The full-release path also retained an older `gcloud run deploy --set-env-vars` command and service IAM rewrite. Remove that path and apply the existing configuration-preserving image update to both full and scoped releases. It changes only the image/release SHA, compares the captured runtime, IAM and pinned tags before traffic, verifies the exact ready image digest and retains Hosting/traffic rollback. Serial release concurrency remains unchanged.

Hub PR404 added 44 lines only for Journey settings/releaseFlags. The rule requires enabled Journey, authorized organization roles, tenant binding, an exact nine-boolean flag map and actor/server-time attribution. It does not change Finance, Connect or MusicScale rules. The flags control UI visibility and do not grant data privileges.

Verified Hub production source 831f0fc4c9ec0965f96e881a27a9b99cfe57a554 has SHA-256 03107a9367c9bb268ba39e13ad88a92092d1bd9bb6fcd59f0c7c680f1fe2f149. Canonical Hub Rules deploy run 39069954671, job 117505317883, succeeded and logged that exact published hash, MILLIONSNEST_FIRESTORE_RULES_DEPLOY_OK and CONNECT_ACTUAL_PUBLISHED_PRIVATE_STORAGE_PROOF_OK. Finance only updates its read-only expected fingerprint; it does not publish shared Rules or indexes.

Validation: Firebase/Cloud Run release contract now rejects replacement environment flags or service IAM mutation and requires preservation checks before cutover. Production CI and live-domain proof remain necessary. No financial data migration or feature flag activation is included. Posting, formal close and authenticated device QA remain incomplete.
