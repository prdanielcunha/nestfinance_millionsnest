# Canonical Hub Rules baseline

The current certified canonical source is Hub production commit
`218cb84c271a49f7ba3569438b843ae3068aad2b` (PR425).
Its exact source SHA256 is
`cdf3bffa148811de97600fd646ea4fd2331b08c9b7da594d03c680f542c5bf05`.
Canonical publication run `39322376345`, job `118299409689`, succeeded and
compared the actual published Rules with this exact versioned source. Its
published-source gate also repeated 445 Connect boundary checks successfully.

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
