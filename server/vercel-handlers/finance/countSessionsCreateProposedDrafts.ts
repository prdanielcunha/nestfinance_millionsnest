import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { stageCanonicalAuditRecord } from './auditFactProjection.js';
import { stageFinanceFact } from './factStream.js';
import { stageTransactionSearchIndex } from './transactionSearchIndex.js';
import { sanitizeFirestoreObject } from './sanitizeFirestoreObject.js';
import {
  generateAllocationId,
  generateAuditId,
  generateTransactionId,
  isValidIdempotencyKey,
  isValidRequestId,
} from '../../../shared/finance/ledger/ids.js';
import { validateAllocation, type FinanceAllocation } from '../../../shared/finance/ledger/allocation.js';
import { validateTransactionCore, type LedgerTransaction } from '../../../shared/finance/ledger/transaction.js';
import { buildTransactionListQueryKeys } from '../../../shared/finance/ledger/listQueryKeys.js';
import { getCompatibility, validateAccountMetadata, validateCategoryMetadata, validateFundMetadata } from '../../../shared/finance/smartLogic.js';
import { buildCountProposalLines } from '../../../shared/finance/countProposal.js';
import { isValidCountSessionId } from '../../../shared/finance/count.js';
import { resolveCanonicalCountEntries } from './countProposalHelpers.js';

type Selection = {
  entryType: 'tithe' | 'offering' | 'other' | 'pix';
  accountId: string;
  categoryId: string;
  fundId?: string | null;
};

function normalizeSelections(value: unknown): Selection[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 4) {
    throw new Error('COUNT_PROPOSAL_INVALID_SELECTIONS');
  }
  const seen = new Set<string>();
  return value.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('COUNT_PROPOSAL_INVALID_SELECTIONS');
    }
    const item = raw as Record<string, unknown>;
    const entryType = String(item.entryType || '');
    if (!['tithe', 'offering', 'other', 'pix'].includes(entryType) || seen.has(entryType)) {
      throw new Error('COUNT_PROPOSAL_INVALID_SELECTIONS');
    }
    seen.add(entryType);
    const accountId = typeof item.accountId === 'string' ? item.accountId.trim() : '';
    const categoryId = typeof item.categoryId === 'string' ? item.categoryId.trim() : '';
    const fundId = typeof item.fundId === 'string' && item.fundId.trim() ? item.fundId.trim() : null;
    if (!accountId || !categoryId) throw new Error('COUNT_PROPOSAL_MISSING_REQUIRED_FIELD');
    return { entryType: entryType as Selection['entryType'], accountId, categoryId, fundId };
  });
}

function sourceCaptureIds(session: any) {
  return Array.from(new Set([
    session.countA?.sourceCaptureId,
    session.countB?.sourceCaptureId,
    ...(Array.isArray(session.recountAttempts)
      ? session.recountAttempts.map((attempt: any) => attempt?.sourceCaptureId)
      : []),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const {
      financeEntityId,
      countSessionId,
      expectedVersion,
      selections: rawSelections,
      idempotencyKey,
      requestId,
    } = req.body || {};

    if (
      typeof financeEntityId !== 'string' ||
      !isValidCountSessionId(countSessionId) ||
      !Number.isInteger(expectedVersion) ||
      expectedVersion < 1 ||
      !isValidIdempotencyKey(idempotencyKey) ||
      !isValidRequestId(requestId)
    ) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const selections = normalizeSelections(rawSelections);
    const { db, uid, actorLabel, organizationId, context } = await resolveFinanceRequestContext(req, 'finance.create_drafts');
    const entityRef = db.collection('organizations').doc(organizationId).collection('financeEntities').doc(financeEntityId);
    const sessionRef = entityRef.collection('countSessions').doc(countSessionId);

    const payloadHash = hashPayload({ countSessionId, expectedVersion, selections });
    const keyHash = buildIdempotencyKeyHash(
      organizationId,
      financeEntityId,
      uid,
      'count_create_proposed_drafts',
      idempotencyKey,
    );

    const result = await executeWithIdempotency(
      db,
      context.repository.getIdempotencyRef(),
      keyHash,
      payloadHash,
      async (transaction) => {
        const sessionDoc = await transaction.get(sessionRef);
        if (!sessionDoc.exists) throw new Error('COUNT_SESSION_NOT_FOUND');
        const session = sessionDoc.data() || {};
        if (session.organizationId !== organizationId || session.financeEntityId !== financeEntityId) {
          throw new Error('COUNT_SESSION_NOT_FOUND');
        }

        const existingTransactionIds = Array.isArray(session.countProposal?.transactionIds)
          ? session.countProposal.transactionIds.filter((value: unknown) => typeof value === 'string')
          : [];
        if (existingTransactionIds.length > 0) {
          return {
            countSessionId,
            version: Number(session.version || expectedVersion),
            workflowState: session.workflowState || 'reviewed',
            transactionIds: existingTransactionIds,
            replayed: true,
          };
        }

        if (Number(session.version) !== expectedVersion) throw new Error('COUNT_VERSION_CONFLICT');
        const canonicalEntries = resolveCanonicalCountEntries(session);
        const lines = buildCountProposalLines(canonicalEntries);
        if (lines.length === 0) throw new Error('COUNT_PROPOSAL_EMPTY');

        const selectionByType = new Map(selections.map((selection) => [selection.entryType, selection]));
        if (lines.some((line) => !selectionByType.has(line.entryType))) {
          throw new Error('COUNT_PROPOSAL_MISSING_REQUIRED_FIELD');
        }
        if (selections.some((selection) => !lines.some((line) => line.entryType === selection.entryType))) {
          throw new Error('COUNT_PROPOSAL_INVALID_SELECTIONS');
        }

        const accountDocs = new Map<string, any>();
        const categoryDocs = new Map<string, any>();
        const fundDocs = new Map<string, any>();

        for (const selection of selections) {
          if (!accountDocs.has(selection.accountId)) {
            const accountDoc = await transaction.get(context.repository.getAccountsRef().doc(selection.accountId));
            accountDocs.set(selection.accountId, accountDoc);
          }
          if (!categoryDocs.has(selection.categoryId)) {
            const categoryDoc = await transaction.get(context.repository.getCategoriesRef().doc(selection.categoryId));
            categoryDocs.set(selection.categoryId, categoryDoc);
          }
          if (selection.fundId && !fundDocs.has(selection.fundId)) {
            const fundDoc = await transaction.get(context.repository.getFundsRef().doc(selection.fundId));
            fundDocs.set(selection.fundId, fundDoc);
          }
        }

        const transactionIds: string[] = [];
        const captures = sourceCaptureIds(session);
        const occurredAt = `${String(session.serviceDate || '')}T12:00:00.000Z`;
        const nextSessionVersion = expectedVersion + 1;

        for (const line of lines) {
          const selection = selectionByType.get(line.entryType)!;
          const accountDoc = accountDocs.get(selection.accountId);
          const categoryDoc = categoryDocs.get(selection.categoryId);
          const fundDoc = selection.fundId ? fundDocs.get(selection.fundId) : null;

          if (!accountDoc?.exists) throw new Error('FINANCE_ACCOUNT_MISMATCH');
          const accountData = accountDoc.data() || {};
          if (accountData.financeEntityId !== financeEntityId || accountData.active === false) {
            throw new Error('FINANCE_ACCOUNT_MISMATCH');
          }
          const accountMeta = validateAccountMetadata(accountData);
          if (!accountMeta.valid) throw new Error('FINANCE_ACCOUNT_CONFIGURATION_INCOMPLETE');
          const compatibility = getCompatibility(accountMeta.type, line.paymentMethod, 'income');
          if (compatibility.level === 'impossible') throw new Error('FINANCE_PAYMENT_INSTRUMENT_INCOMPATIBLE');

          if (!categoryDoc?.exists) throw new Error('FINANCE_CATEGORY_MISMATCH');
          const categoryData = categoryDoc.data() || {};
          if (categoryData.financeEntityId !== financeEntityId || categoryData.active === false || categoryData.kind !== 'income') {
            throw new Error('FINANCE_CATEGORY_MISMATCH');
          }
          const categoryMeta = validateCategoryMetadata(categoryData);
          if (!categoryMeta.valid) throw new Error('FINANCE_CATEGORY_CONFIGURATION_INCOMPLETE');

          let fundSnapshot: { id: string; name: string } | undefined;
          if (selection.fundId) {
            if (!fundDoc?.exists) throw new Error('FINANCE_FUND_MISMATCH');
            const fundData = fundDoc.data() || {};
            if (fundData.financeEntityId !== financeEntityId || fundData.active === false) {
              throw new Error('FINANCE_FUND_MISMATCH');
            }
            const fundMeta = validateFundMetadata(fundData);
            if (!fundMeta.valid) throw new Error('FINANCE_FUND_CONFIGURATION_INCOMPLETE');
            fundSnapshot = { id: selection.fundId, name: fundMeta.name! };
          }

          const transactionId = generateTransactionId();
          const allocationId = generateAllocationId();
          const accountSnapshot = {
            id: selection.accountId,
            name: accountMeta.name!,
            type: accountMeta.type!,
            nature: accountMeta.nature!,
          };
          const categorySnapshot = {
            id: selection.categoryId,
            name: categoryMeta.name!,
            type: categoryMeta.kind!,
            icon: categoryMeta.icon,
          };

          const allocation: FinanceAllocation = {
            id: allocationId,
            organizationId,
            financeEntityId,
            transactionId,
            categoryId: selection.categoryId,
            categorySnapshot: categorySnapshot as any,
            amountCents: line.amountCents,
            sequence: 0,
            createdAt: new Date().toISOString(),
            createdBy: uid,
            schemaVersion: 1,
          };
          if (selection.fundId) {
            allocation.fundId = selection.fundId;
            allocation.fundSnapshot = fundSnapshot;
          }
          validateAllocation(allocation, financeEntityId, 'income');

          const description = String(session.serviceLabel || 'Count');
          const countSource = {
            countSessionId,
            countVersion: expectedVersion,
            countEntryType: line.entryType,
            sourceCaptureIds: captures,
            firstCounterLabel: session.countA?.countedByLabel || session.countA?.enteredByLabel || null,
            secondCounterLabel: session.countB?.countedByLabel || session.countB?.enteredByLabel || null,
            serviceLabel: String(session.serviceLabel || ''),
            serviceDate: String(session.serviceDate || ''),
          };

          const txPayload: any = {
            id: transactionId,
            organizationId,
            financeEntityId,
            transactionKind: 'income',
            direction: 'income',
            cashFlowDirection: 'inflow',
            status: 'ready_for_review',
            amountCents: line.amountCents,
            currency: 'BRL',
            occurredAt,
            recordedAt: new Date().toISOString(),
            paymentMethod: line.paymentMethod,
            sourceContext: 'count_session',
            description,
            evidenceIds: [],
            evidenceJustification: `count_session:${countSessionId}`,
            reconciliationStatus: 'unreconciled',
            accountId: selection.accountId,
            accountSnapshot,
            allocationIds: [allocationId],
            countSource,
            createdBy: uid,
            updatedBy: uid,
            version: 1,
            contentVersion: 1,
            schemaVersion: 1,
            validationIssues: [],
          };
          validateTransactionCore(txPayload as LedgerTransaction);

          const txRef = context.repository.getTransactionsRef().doc(transactionId);
          const txData = sanitizeFirestoreObject({
            ...txPayload,
            listQueryKeys: buildTransactionListQueryKeys(
              financeEntityId,
              transactionId,
              'income',
              'ready_for_review',
              occurredAt,
            ),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          transaction.set(txRef, txData);
          transaction.set(
            context.repository.getAllocationsRef().doc(allocationId),
            sanitizeFirestoreObject({ ...allocation, createdAt: FieldValue.serverTimestamp() }),
          );
          stageTransactionSearchIndex(transaction, db, {
            organizationId,
            financeEntityId,
            transactionId,
            transactionData: txData,
          });

          const auditId = generateAuditId();
          const auditRef = context.repository.getAuditRef().doc(auditId);
          stageCanonicalAuditRecord(transaction, db, auditRef, {
            eventId: auditId,
            organizationId,
            financeEntityId,
            actor: uid,
            resource: 'transaction',
            resourceId: transactionId,
            action: 'transaction.created_from_count',
            requestId,
            idempotencyKey,
            afterHash: hashPayload({ transactionId, countSessionId, line, selection }),
            metadata: {
              status: 'ready_for_review',
              sourceContext: 'count_session',
              countSessionId,
              countEntryType: line.entryType,
              amountCents: line.amountCents,
              postingPerformed: false,
            },
            createdAt: FieldValue.serverTimestamp(),
          });

          stageFinanceFact(transaction, db, {
            organizationId,
            eventType: 'TRANSACTION_CREATED',
            entityType: 'finance_transaction',
            entityId: transactionId,
            actorUserId: uid,
            correlationId: requestId,
            payload: {
              financeEntityId,
              status: 'ready_for_review',
              transactionKind: 'income',
              amountCents: line.amountCents,
              currency: 'BRL',
              version: 1,
              sourceContext: 'count_session',
              countSessionId,
            },
            sourceRefs: [
              { kind: 'record', ref: txRef.path, version: 1 },
              { kind: 'audit', ref: auditRef.path },
              { kind: 'record', ref: sessionRef.path, version: nextSessionVersion },
            ],
          });

          const eventId = generateAuditId();
          transaction.set(entityRef.collection('events').doc(eventId), sanitizeFirestoreObject({
            eventId,
            organizationId,
            financeEntityId,
            transactionId,
            eventType: 'created_from_count',
            actorUid: uid,
            actorDisplayNameSnapshot: actorLabel,
            versionBefore: null,
            versionAfter: 1,
            requestId,
            createdAt: FieldValue.serverTimestamp(),
          }));

          transactionIds.push(transactionId);
        }

        transaction.update(sessionRef, {
          workflowState: 'reviewed',
          reviewedAt: FieldValue.serverTimestamp(),
          countProposal: {
            status: 'created',
            transactionIds,
            sourceVersion: expectedVersion,
            createdByUid: uid,
            createdByLabel: actorLabel,
            createdAt: FieldValue.serverTimestamp(),
          },
          updatedByUid: uid,
          version: nextSessionVersion,
          updatedAt: FieldValue.serverTimestamp(),
        });

        const sessionAuditId = generateAuditId();
        const sessionAuditRef = context.repository.getAuditRef().doc(sessionAuditId);
        stageCanonicalAuditRecord(transaction, db, sessionAuditRef, {
          eventId: sessionAuditId,
          organizationId,
          financeEntityId,
          actor: uid,
          resource: 'count_session',
          resourceId: countSessionId,
          action: 'count.proposed_entries_created',
          requestId,
          idempotencyKey,
          afterHash: payloadHash,
          metadata: {
            versionBefore: expectedVersion,
            versionAfter: nextSessionVersion,
            workflowState: 'reviewed',
            transactionIds,
            postingPerformed: false,
          },
          createdAt: FieldValue.serverTimestamp(),
        });

        stageFinanceFact(transaction, db, {
          organizationId,
          eventType: 'COUNT_UPDATED',
          entityType: 'count_session',
          entityId: countSessionId,
          actorUserId: uid,
          correlationId: requestId,
          payload: {
            financeEntityId,
            status: 'matched',
            workflowState: 'reviewed',
            version: nextSessionVersion,
            proposedTransactionCount: transactionIds.length,
            postingPerformed: false,
          },
          sourceRefs: [
            { kind: 'record', ref: sessionRef.path, version: nextSessionVersion },
            { kind: 'audit', ref: sessionAuditRef.path },
          ],
        });

        return {
          countSessionId,
          version: nextSessionVersion,
          workflowState: 'reviewed',
          transactionIds,
          replayed: false,
        };
      },
    );

    return res.status(200).json({ ...result, requestId });
  } catch (error: any) {
    const message = String(error?.message || error?.code || '');
    console.error('Count Proposed Drafts Error:', message.startsWith('COUNT_') || message.startsWith('FINANCE_') ? message : 'UNEXPECTED_ERROR');
    if (message === 'COUNT_SESSION_NOT_FOUND') return res.status(404).json({ error: message });
    if (message === 'COUNT_VERSION_CONFLICT' || message.includes('FINANCE_IDEMPOTENCY_CONFLICT')) {
      return res.status(409).json({ error: message.includes('FINANCE_') ? 'FINANCE_IDEMPOTENCY_CONFLICT' : message });
    }
    if (message.startsWith('COUNT_') || message.startsWith('FINANCE_')) {
      return res.status(400).json({ error: message });
    }
    if (message === 'FORBIDDEN_FINANCE_ACCESS') return res.status(403).json({ error: 'FORBIDDEN' });
    if (error.status === 401 || error.status === 403) return res.status(error.status).json({ error: error.error || 'UNAUTHORIZED' });
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
