# Canonical Hub Rules baseline

The current certified canonical source is Hub production commit
`5fb11db71f57550e9c32617a5da13ecf2bcfd45a` (PR428).
Its exact source SHA256 is
`5372febb59a285e40a567d6caaf5b35ac9ed97f23646e0ffe93959a6bf55f8cd`.
Canonical publication run `39324830021`, job `118307818773`, succeeded and
compared the actual published Rules with this exact versioned source. Its
published-source gate also repeated 445 Connect boundary checks successfully.

Relative to the previous certified Central People source (PR425, SHA256
`cdf3bffa148811de97600fd646ea4fd2331b08c9b7da594d03c680f542c5bf05`),
the only Rules change is a narrower Journey people-create denial: all current
and future organizations must use the canonical gateway. Finance, root profile,
membership and access audit guards are byte-unchanged. Later production commit
`1efb6939e7ed5525d9eed7378811df6928a3c752` has the same Rules blob/source hash.
Both the focused diff and the actual published hash were independently verified.
Finance release `39325536472` correctly stopped before image push/deployment
when this concurrent Hub publication changed the live source. Never bypass that
guard or roll back unrelated canonical Hub changes to make a release pass.

Compared with the prior certified authority source
`f8e53e531169fb658fce646fb7abd241a286af2e343b3a446a8d33f1a17709a9`,
the additions are scoped to Central People/Journey: server-owned directory
namespaces, protected central-person links and equivalent bounded role helpers.
The Finance namespace denial, canonical/legacy server-owned memberships, root
profile authority/session guards and access-change audit protections are preserved.
The exact diff and matching live hash were independently reviewed.

The earlier authority patch (Hub PR417/418) replaced fingerprint
`3e13dbc593090f830c95d88749efe787dcf22699cc027bbc0736a857b5c66ee1`.
The focused change closes two reproduced overlapping-allow bypasses: a Rules v2
recursive user wildcard could override protected root identity fields, and the
generic organization wildcard could allow direct canonical membership writes.
The new source protects user lifecycle/session authority, reserves canonical
memberships and legacy mirrors to authenticated server commands, and protects
NestFinance access-change audit evidence against client forgery/deletion.
Existing Finance gateway-only storage restrictions remain intact.

The new canonical publication again passed 114 authority tampering denials and
575 Finance gateway denials. The authority emulator gate preserves
benign profile edits, nested preferences, unrelated app data and
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
