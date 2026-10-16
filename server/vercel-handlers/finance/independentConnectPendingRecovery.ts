import { randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { parseFinanceOperatorTargets } from './connectPendingEventPublisher.js';
import { isFinanceConnectMarker, recoverFinanceConnectReceipt } from './connectPendingReceiptOutbox.js';

/** Only private canonical receipts in an approved organization are scanned.
 * No document/amount/PII is copied into the event or logs. Never invokes a
 * financial command: the only writes are Connect markers and the scan cursor. */
export async function runIndependentFinanceRecovery(input: {
  enabled: boolean; signingSecret?: string; operatorTargetsJson?: string;
  db: () => Firestore; recover?: typeof recoverFinanceConnectReceipt;
}) {
  const totals = { enabled: input.enabled, tenants: 0, failures: 0,
    scanned: 0, completed: 0, review: 0, pending: 0 };
  if (!input.enabled) return totals;
  const targets = parseFinanceOperatorTargets(input.operatorTargetsJson);
  if (!input.signingSecret || input.signingSecret.length < 32 || input.signingSecret.length > 4096 ||
      !targets || !Object.keys(targets).length) throw Error('FINANCE_CONNECT_RECOVERY_NOT_CONFIGURED');
  const db = input.db();
  for (const organizationId of Object.keys(targets).sort()) {
    totals.tenants++;
    try {
      const receipts = db.collection('organizations').doc(organizationId).collection('financeIdempotency');
      const cursorRef = receipts.doc('_connectRecoveryCursorV1');
      const cursor = (await cursorRef.get()).data();
      const token = typeof cursor?.token === 'string' ? cursor.token : '';
      const after = typeof cursor?.after === 'string' && /^[a-f0-9]{64}$/.test(cursor.after) ? cursor.after : '';
      let query = receipts.where('connectOutbox.state', 'in', ['pending', 'processing']).orderBy('__name__').limit(5);
      if (after) query = query.startAfter(after);
      const page = await query.get();
      for (const row of page.docs) {
        totals.scanned++;
        const marker: unknown = row.data()?.connectOutbox;
        if (!/^[a-f0-9]{64}$/.test(row.id) || !isFinanceConnectMarker(marker) ||
            marker.organizationId !== organizationId) continue;
        const result = await (input.recover ?? recoverFinanceConnectReceipt)({
          enabled: true, db, idempotencyRef: receipts, receiptKey: row.id,
          organizationId, financeEntityId: marker.financeEntityId,
          signingSecret: input.signingSecret, operatorTargetsJson: input.operatorTargetsJson,
        });
        if (result === 'complete') totals.completed++;
        else if (result === 'needs_review') totals.review++;
        else if (result === 'pending') totals.pending++;
      }
      // CAS stops an older concurrent scan moving a newer cursor backwards.
      await db.runTransaction(async tx => {
        const current = (await tx.get(cursorRef)).data();
        if ((typeof current?.token === 'string' ? current.token : '') !== token) return;
        tx.set(cursorRef, { schemaVersion: 1, token: randomUUID(), after: page.docs.at(-1)?.id ?? '' });
      });
    } catch { totals.failures++; }
  }
  return totals;
}
