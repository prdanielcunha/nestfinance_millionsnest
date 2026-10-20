# Count origin and financial reversal history

This change extends the integrated `certifiedLedgerStore` from PR341. It does not introduce another accounting book or enable posting in production.

- Approval v3 binds the Count source when present. Actual posting re-reads the assigned Count session, independent evidence, source version, treasury proposal, amount, method and received day. V3 Count also requires accepted treasury review and the correct recount cycle.
- A source dimension can be claimed only once. The current claim and an immutable receipt are committed with the journal. Reversal preserves that receipt and marks the current claim reversed. Reusing it requires a newer verified Count revision and an immutable reversal of the original posting in its original accounting date; a later refund cannot authorize recognizing the old cash count again.
- Posting requires an identifiable approver matching the source transaction. A matching material hash without that actor is insufficient.
- Reversal preserves the original journal. The canonical audit retains full before/after transaction/allocation material; the transaction's private correction history stores bounded snapshots, reason, server-owned actor/time and the source version transition.
- The existing history screen shows the original amount, posted/reversed state, accounting effect date and the amount remaining posted after the reversal in PT/EN/ES. It does not replace the original transaction amount with zero.
- Posting/reversal facts use immutable journal identity, so separate operations sharing a client request/correlation ID cannot collide.

The public ledger commands, setup/opening workflow, replacement drafts, operational obligations, remittances and formal close/reopen remain separate integration requirements. No production data, permission, shared Rules, index, IAM or billing mutation is performed by these changes. No full-app or physical-device certification is claimed.

Validation: existing 47-case certified-book domain checks, Count-origin unit checks, draft correction/edit regressions and typecheck. The dedicated Java21 demo-emulator workflow additionally verifies real Count posting/duplicate-source rejection, reversal receipts and complete before/after history alongside the existing accounting journey. Collect its actual conclusion before integration.
