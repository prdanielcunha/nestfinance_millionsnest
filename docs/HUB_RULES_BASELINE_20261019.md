# Canonical Hub Rules baseline

The canonical authority security patch is Hub production commit
`b3fe22ba47604422229577c3ed961598e969fd8b` (PR417).
Its exact source SHA256 is
`f8e53e531169fb658fce646fb7abd241a286af2e343b3a446a8d33f1a17709a9`.
Canonical publication evidence is run `39239780589`, job `118017502144`;
its mandatory final gate compares the actual published Rules with this exact
versioned source. Finance publication must wait for that job to succeed.

This replaces the previously certified fingerprint
`3e13dbc593090f830c95d88749efe787dcf22699cc027bbc0736a857b5c66ee1`.
The focused change closes two reproduced overlapping-allow bypasses: a Rules v2
recursive user wildcard could override protected root identity fields, and the
generic organization wildcard could allow direct canonical membership writes.
The new source protects user lifecycle/session authority, reserves canonical
memberships and legacy mirrors to authenticated server commands, and protects
NestFinance access-change audit evidence against client forgery/deletion.
Existing Finance gateway-only storage restrictions remain intact.

The mandatory authority emulator gate denies 114 tampering operations while
preserving benign profile edits, nested preferences, unrelated app data and
trusted server commands. The shared publication also requires the existing
NestJourney, Connect, Finance, MusicScale and NestAffiliate Rules suites.

Finance updates only its immutable expected fingerprint, policy assertion and
documentation. The exact-match fail-closed check remains mandatory and reads the
actual published source. This is not a Finance deployment of shared Rules, a
member permission migration, a runtime configuration change or an IAM change.
Any further unreviewed live Rules change still stops Finance publication.

Do not restore the vulnerable shared Rules as a rollback. After individual
member permissions are saved, application rollback must also retain the
individual-access-aware Finance server; use a compatible reviewed fix forward.
