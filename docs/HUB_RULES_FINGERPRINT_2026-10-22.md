# Audited canonical Hub rules fingerprint

The approved NF branding release stopped at the existing fail-closed shared-rules gate. No application release had been published when that check failed.

Old reference: Hub production `5fb11db`, SHA-256 `5372febb59a285e40a567d6caaf5b35ac9ed97f23646e0ffe93959a6bf55f8cd`.

Current audited reference: Hub production `8983f0024815bbeb0312dde9cd04ad42d787b341` (PR467), SHA-256 `f4751402d5cf9daf37c8685b2dcd4b5367ed62f91276242c5c784938634d480c`.

The complete source diff adds only `app != 'trial_usage'` and `app != 'musicscaleLiveAiUsage'` to the generic organization create/update/delete allow conditions. This narrows browser writes to server-owned trial counters. Finance, identity, membership, audit, reads and all other conditions are unchanged. Security review found no additional access or bypass in this delta.

Canonical deployment proof: [Hub Rules publication run 39852181752](https://github.com/prdanielcunha/millionsnest/actions/runs/39852181752), job `120080984327`, completed successfully. Its authenticated readback compared the actual published source byte-for-byte against the canonical source, logged the SHA-256 above and passed `CONNECT_ACTUAL_PUBLISHED_PRIVATE_STORAGE_PROOF_OK`. The same commit passed the NestFinance canonical gateway storage, canonical authority and product Rules gates.

Only the pinned reference and its contract test are updated in NestFinance. The read-only, fail-closed check remains mandatory; no shared rules, IAM, data, authentication, permissions or deploy ordering are changed. Any further live drift still stops release.
