# Canonical Hub Rules baseline

Finance release 39186944559 stopped safely before publishing because its strict
read-only Rules fingerprint still referenced Hub PR408. The live application
remained on ca56e97aa19b; no Rules, indexes, IAM or financial data were modified.

Canonical Hub production commit `7dcbcbe414ea0fc80ca15a7750fd5a5adbf309f1`
was published by successful run `39175718830`, job `117817844387`. Its exact
candidate and published SHA256 is
`3e13dbc593090f830c95d88749efe787dcf22699cc027bbc0736a857b5c66ee1`.
The job verified actual published source and passed the NestFinance gateway
storage suite, alongside the other products' security suites.

Compared with the previous approved source, the sole Rules change is the
tenant-local NestJourney `personBirthdays` path. Finance gateway-only exclusions,
membership rules and global authority helpers are unchanged. The new birthday
path requires entitlement, active membership/app access, unit-scoped sharing,
validated immutable identity and an atomic audit record on writes.

Finance updates only the immutable expected fingerprint and its policy test.
The exact-match fail-closed check remains mandatory. This is not a shared Rules
deployment, permission grant, runtime configuration or IAM change. A further
unreviewed live Rules change still stops publication.
