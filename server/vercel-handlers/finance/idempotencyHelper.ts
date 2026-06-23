import { FieldValue, type Firestore, type CollectionReference, type Transaction } from 'firebase-admin/firestore';
import { createHash } from 'crypto';

export function hashPayload(payload: any): string {
  // Stable serialization: wait, deterministic stringify isn't native, 
  // but for simple flat objects Sorting keys works
  const stableStringify = (obj: any): string => {
    if (obj === null) return 'null';
    if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
    if (typeof obj === 'object') {
      const keys = Object.keys(obj).sort();
      return '{' + keys.map(k => '"' + k + '":' + stableStringify(obj[k])).join(',') + '}';
    }
    return JSON.stringify(obj);
  };
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

export function buildIdempotencyKeyHash(
  organizationId: string,
  financeEntityId: string,
  actor: string,
  operation: string,
  idempotencyKey: string
): string {
  // key is scoped by organization, entity, actor e operation
  const raw = organizationId + ':' + financeEntityId + ':' + actor + ':' + operation + ':' + idempotencyKey;
  return createHash('sha256').update(raw).digest('hex');
}

export async function executeWithIdempotency<T>(
  db: Firestore,
  idempotencyRef: CollectionReference,
  keyHash: string,
  payloadHash: string,
  operationFn: (transaction: Transaction) => Promise<T>,
  validateFn?: (transaction: Transaction) => Promise<void>
): Promise<T> {
  return db.runTransaction(async (t) => {
    const docRef = idempotencyRef.doc(keyHash);
    const doc = await t.get(docRef);

    if (doc.exists) {
      const data = doc.data()!;
      if (data.payloadHash === payloadHash) {
         if (data.status === 'completed') {
             return data.result as T;
         } else {
             throw new Error('FINANCE_IDEMPOTENCY_CONFLICT: In progress');
         }
      } else {
         throw new Error('FINANCE_IDEMPOTENCY_CONFLICT: Payload mismatch');
      }
    }

    // Optional early validations within transaction
    if (validateFn) {
        await validateFn(t);
    }

    const result = await operationFn(t);

    t.set(docRef, { status: 'completed', payloadHash, result, createdAt: FieldValue.serverTimestamp(), completedAt: FieldValue.serverTimestamp() });
    
    return result;
  });
}
