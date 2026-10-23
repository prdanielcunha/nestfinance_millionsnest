# Native Google entry recovery

The direct-entry service previously awaited persistence before opening Google,
then fell back to a cross-origin redirect when a popup was blocked. Its legacy
redirect completion silently returned null when Firebase had no redirect result.
This combination can return Safari users to an unchanged login screen.

Use Firebase's documented popup alternative (redirect best practices, option 2):
https://firebase.google.com/docs/auth/web/redirect-best-practices#popup-sign-in

`getAuth` already supplies browser persistence. Invoke the popup immediately from
the user's click; report failures with a retry instead of starting an unreliable
cross-origin redirect. Complete redirects from older releases, report a missing
credential, and recover persisted direct/primary identities through the same
server authorization endpoint. Recovery is single-flight for React StrictMode.
Switching accounts clears both sessions and tenant caches before a fresh click.

Google/Firebase still establishes the UID; `/api/auth/direct-entry` and the
canonical ecosystem resolver alone establish organizations, global system roles,
membership, entitlements and access. No email matching or privilege exception is
introduced. Hub handoff and the OAuth provider configuration are unchanged.

Regression: `npm run test:google-entry-recovery` executes the actual service with
a synthetic Firebase transport and covers popup invocation timing, blocked
popups, restored identity, organization selection, StrictMode, missing legacy
redirect credentials and account switching. Existing server session, revocation,
handoff and tenant isolation tests remain required. A real account/device login
is necessary to confirm the final Safari/Google provider interaction.
