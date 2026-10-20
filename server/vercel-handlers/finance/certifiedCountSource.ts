import { FieldValue, type Firestore, type DocumentReference, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { compareCountEntries, isValidCountSessionId } from '../../../shared/finance/count.js';
import { buildCountV3TreasuryReviewPacket } from '../../../shared/finance/countV3TreasuryReview.js';
import { receiptDay, validReceiptDate } from '../../../shared/finance/receivedIncome.js';
import { resolveCanonicalCountEntries } from './countProposalHelpers.js';
import { hashPayload } from './idempotencyHelper.js';
import { assertBookEntry, assertBookScope, bookId } from '../../../shared/finance/ledger/certifiedPosting.js';

const fail = (code = 'LEDGER_COUNT_SOURCE_INVALID'): never => { throw Object.assign(new Error(code), { code, status: 409 }); };
/** Re-reads the sealed source and its treasury assignment in the same
 * transaction as approval/posting. A copied Count ID is not proof of income. */
export async function validateLedgerCountSource(input: {
  reader: { get(ref: DocumentReference): Promise<DocumentSnapshot> }; db: Firestore; organizationId: string; financeEntityId: string; transaction: any; timezone: string;
}): Promise<string | null> {
  const { reader, db, organizationId, financeEntityId, transaction: tx, timezone } = input;
  if (!tx.countSource) {
    if (tx.sourceContext === 'count_session') fail();
    return null;
  }
  const source = tx.countSource;
  if (tx.transactionKind !== 'income' || tx.sourceContext !== 'count_session' || !isValidCountSessionId(source.countSessionId) ||
    !Number.isSafeInteger(source.countVersion) || source.countVersion < 1 || !validReceiptDate(source.receivedDate) ||
    source.receivedDate !== receiptDay(tx.occurredAt, timezone)) fail();
  const v3 = source.countSchemaVersion === 3;
  if (source.countSchemaVersion !== undefined && !v3) fail();
  const ref = db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId)
    .collection(v3 ? 'countVerificationSessions' : 'countSessions').doc(source.countSessionId);
  const doc = await reader.get(ref); const session = doc.data();
  if (!doc.exists || session?.organizationId !== organizationId || session.financeEntityId !== financeEntityId ||
    !(v3 ? ['matched', 'requires_treasury_review'].includes(session.status) : session.status === 'matched') || session.version !== source.countVersion + 1 ||
    session.countProposal?.sourceVersion !== source.countVersion || session.countProposal?.status !== 'created' ||
    !Array.isArray(session.countProposal?.transactionIds) || !session.countProposal.transactionIds.includes(tx.id) ||
    source.serviceDate !== session.serviceDate) fail();
  let canonical: unknown; let amountCents: number; let method: string;
  if (v3) {
    const packet = buildCountV3TreasuryReviewPacket({ ...session, id: doc.id });
    if (!packet.treasuryAccepted || packet.requiresPurposeClassification ||
      session.treasuryReview.sourceVersion !== source.countVersion - 1 || source.recountCycle !== packet.recountCycle) fail();
    method = source.countReceiptMethod;
    amountCents = packet.allocations.filter(line => line.purpose === source.countEntryType && line.receiptMethod === method)
      .reduce((sum, line) => sum + line.amountCents, 0);
    canonical = { allocations: packet.allocations, policy: session.policySnapshot, confirmations: session.confirmations,
      treasuryReview: session.treasuryReview, recountCycle: packet.recountCycle };
    if (method === 'card') { if (!['credit_card', 'debit_card'].includes(tx.paymentMethod)) fail(); }
    else if (method !== tx.paymentMethod) fail();
  } else {
    const entries = resolveCanonicalCountEntries(session);
    const first = session.countA; const second = session.countB;
    const actor = (value: any) => value?.countedByUid || value?.enteredByUid;
    if (!Array.isArray(first?.entries) || !Array.isArray(second?.entries) || !actor(first) || !actor(second)) fail();
    const originalMatched = compareCountEntries(first.entries, second.entries).matched;
    let independentlyMatched = originalMatched && actor(first) !== actor(second);
    if (!originalMatched) {
      const attempt = session.recountAttempts?.find((value: any) => value.attemptNumber === session.resolution?.recountAttemptNumber);
      if (!attempt || !actor(attempt)) fail();
      independentlyMatched = [first, second].some(value => actor(value) !== actor(attempt) &&
        compareCountEntries(value.entries, attempt.entries).matched && compareCountEntries(entries, attempt.entries).matched);
    }
    if (!independentlyMatched) fail('LEDGER_COUNT_INDEPENDENCE_REQUIRED');
    const line = entries.find(value => value.type === source.countEntryType);
    if (!line) fail();
    amountCents = line.totalCents; method = line.channel;
    if (tx.paymentMethod !== method || (session.collectionScope === 'cash_only' && method !== 'cash')) fail();
    canonical = { entries, countA: first, countB: second, resolution: session.resolution || null,
      recountAttempts: session.recountAttempts || [], policy: session.policySnapshot || null };
  }
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents !== tx.amountCents) fail('LEDGER_COUNT_SOURCE_AMOUNT_MISMATCH');
  return 'sha256:' + hashPayload({ organizationId, financeEntityId, countSessionId: doc.id,
    sourceVersion: source.countVersion, transactionId: tx.id, source, amountCents, method,
    assignment: session.countProposal, canonical });
}

type CountClaimScope = { db: Firestore; organizationId: string; financeEntityId: string };
export async function readCertifiedCountClaim(t: Transaction, scope: CountClaimScope, tx: any, timeZone: string) {
  const proofHash = await validateLedgerCountSource({ ...scope, reader: t, transaction: tx, timezone: timeZone });
  if (!proofHash) return null;
  const source = tx.countSource;
  const claimId = 'count_posted_' + bookId(scope.financeEntityId, source.countSessionId, source.countEntryType, source.countReceiptMethod || tx.paymentMethod);
  const org = scope.db.collection('organizations').doc(scope.organizationId);
  const ref = org.collection('financeUniqueKeys').doc(claimId);
  const snapshot = await t.get(ref); const previous = snapshot.data();
  if (previous) {
    assertBookScope(previous, scope.organizationId, scope.financeEntityId);
    if (previous.state !== 'reversed') fail('LEDGER_COUNT_SOURCE_ALREADY_POSTED');
    if (!Number.isSafeInteger(previous.countVersion) || previous.countVersion >= source.countVersion ||
      typeof previous.transactionId !== 'string' || typeof previous.reversalJournalEntryId !== 'string') fail();
    const [originalTx, inverse, originalJournal] = await t.getAll(org.collection('financeTransactions').doc(previous.transactionId),
      org.collection('financeJournalEntries').doc(previous.reversalJournalEntryId),org.collection('financeJournalEntries').doc(previous.journalEntryId));
    if (!originalTx.exists || !inverse.exists || !originalJournal.exists) fail();
    const original = originalTx.data()!; const reversal = inverse.data() as any;
    assertBookScope(original, scope.organizationId, scope.financeEntityId);
    assertBookEntry(reversal, scope.organizationId, scope.financeEntityId);
    assertBookEntry(originalJournal.data() as any, scope.organizationId, scope.financeEntityId);
    if (original.status !== 'reversed' || original.reversalJournalEntryId !== inverse.id ||
      reversal.sourceTransactionId !== previous.transactionId || reversal.reversalOfEntryId !== previous.journalEntryId) fail();
    if(reversal.effectiveDate!==originalJournal.data()!.effectiveDate)fail('LEDGER_COUNT_CORRECTION_REQUIRES_ORIGINAL_PERIOD');
  }
  return { ref, proofHash, previous: previous || null };
}

export function stageCertifiedCountClaim(t: Transaction, scope: CountClaimScope, claim: NonNullable<Awaited<ReturnType<typeof readCertifiedCountClaim>>>, tx: any, journalEntryId: string, uid: string) {
  const source = tx.countSource;
  const material = { organizationId: scope.organizationId, financeEntityId: scope.financeEntityId,
    state: 'posted', countSessionId: source.countSessionId, countVersion: source.countVersion,
    countEntryType: source.countEntryType, receiptMethod: source.countReceiptMethod || tx.paymentMethod,
    transactionId: tx.id, journalEntryId, countSourceProofHash: claim.proofHash,
    claimedBy: uid, claimedAt: FieldValue.serverTimestamp() };
  const receipt = scope.db.collection('organizations').doc(scope.organizationId).collection('financeUniqueKeys')
    .doc('count_claim_' + bookId(scope.financeEntityId, journalEntryId));
  t.create(receipt, { ...material, previousClaim: claim.previous });
  t.set(claim.ref, material);
}

export async function readCertifiedCountReversalClaim(t: Transaction, scope: CountClaimScope, tx: any) {
  if (!tx.countSource) return null;
  const source = tx.countSource;
  const ref = scope.db.collection('organizations').doc(scope.organizationId).collection('financeUniqueKeys')
    .doc('count_posted_' + bookId(scope.financeEntityId, source.countSessionId, source.countEntryType, source.countReceiptMethod || tx.paymentMethod));
  const snapshot = await t.get(ref); const claim = snapshot.data();
  assertBookScope(claim, scope.organizationId, scope.financeEntityId);
  if (!claim || claim.state !== 'posted' || claim.transactionId !== tx.id || claim.journalEntryId !== tx.journalEntryId ||
    claim.countVersion !== source.countVersion) fail();
  return ref;
}
