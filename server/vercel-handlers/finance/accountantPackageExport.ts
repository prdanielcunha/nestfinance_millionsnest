import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Timestamp } from 'firebase-admin/firestore';
import { resolveFinanceRequestContext } from './accessHelpers.js';
import { getTransactionListQueryBounds } from '../../../shared/finance/ledger/listQueryKeys.js';
import {
  buildAccountantManifest,
  buildCsv,
  normalizeAccountantPackageLayout,
} from '../../../shared/finance/accountantPackage.js';
import {
  PERIOD_CLOSE_MAX_EVIDENCE,
  PERIOD_CLOSE_MAX_TRANSACTIONS,
} from '../../../shared/finance/periodCloseReadiness.js';
import { loadPeriodCloseReadModel, parsePeriod } from './periodCloseReadModel.js';

const MAX_ALLOCATIONS = 3000;

function toIso(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === 'function') {
    try { return value.toDate().toISOString(); } catch { return null; }
  }
  return null;
}

function money(value: unknown) {
  const cents = Number(value);
  return Number.isSafeInteger(cents) ? (cents / 100).toFixed(2) : '';
}

function textFileHeader(period: string, generatedAt: string) {
  return [
    'NestFinance — pacote mensal para contador',
    'Período: ' + period,
    'Gerado em: ' + generatedAt,
    '',
    'Conteúdo:',
    '- transactions.csv: movimentações registradas no período',
    '- evidence-index.csv: índice dos comprovantes/documentos capturados no período',
    '- pending-justifications-reconciliation.csv: pendências, justificativas e estado de conciliação',
    '- manifest.json: escopo, contagens e limites de autoridade do pacote',
    '',
    'IMPORTANTE: este pacote é uma exportação operacional. Ele não certifica postagem, obrigações fiscais, escrituração oficial ou fechamento contábil.',
    'A certificação de postagem é uma etapa separada e permanece protegida.',
    '',
  ].join('\n');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });

  try {
    const financeEntityId = req.body?.financeEntityId;
    const period = parsePeriod(req.body?.period);
    if (typeof financeEntityId !== 'string' || !financeEntityId.trim() || !period) {
      return res.status(400).json({ error: 'INVALID_PARAMETERS' });
    }

    const layout = normalizeAccountantPackageLayout(req.body?.layout);
    const { db, organizationId, context } =
      await resolveFinanceRequestContext(req, 'finance.view');

    const bounds = getTransactionListQueryBounds(
      financeEntityId,
      undefined,
      undefined,
      period.start.toISOString(),
      period.end.toISOString(),
    );
    const txQuery = context.repository
      .getTransactionsQuery()
      .where(bounds.field, '>=', bounds.startAt)
      .where(bounds.field, '<', bounds.endBefore)
      .orderBy(bounds.field, 'asc')
      .limit(PERIOD_CLOSE_MAX_TRANSACTIONS + 1);

    const entityRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('financeEntities')
      .doc(financeEntityId);
    const evidenceQuery = entityRef
      .collection('universalEvidence')
      .where('createdAt', '>=', Timestamp.fromDate(period.start))
      .where('createdAt', '<', Timestamp.fromDate(period.end))
      .orderBy('createdAt', 'asc')
      .limit(PERIOD_CLOSE_MAX_EVIDENCE + 1);

    const [txSnapshot, allocationSnapshot, evidenceSnapshot, closeModel] = await Promise.all([
      txQuery.get(),
      context.repository.getAllocationsQuery().limit(MAX_ALLOCATIONS + 1).get(),
      evidenceQuery.get(),
      loadPeriodCloseReadModel({
        db,
        organizationId,
        financeEntityId,
        context,
        period,
      }),
    ]);

    if (txSnapshot.size > PERIOD_CLOSE_MAX_TRANSACTIONS) {
      return res.status(422).json({ error: 'ACCOUNTANT_PACKAGE_TRANSACTION_SCOPE_TOO_LARGE' });
    }
    if (allocationSnapshot.size > MAX_ALLOCATIONS) {
      return res.status(422).json({ error: 'ACCOUNTANT_PACKAGE_ALLOCATION_SCOPE_TOO_LARGE' });
    }
    if (evidenceSnapshot.size > PERIOD_CLOSE_MAX_EVIDENCE) {
      return res.status(422).json({ error: 'ACCOUNTANT_PACKAGE_EVIDENCE_SCOPE_TOO_LARGE' });
    }

    const transactionIds = new Set(txSnapshot.docs.map((doc: any) => doc.id));
    const allocationsByTransaction = new Map<string, any[]>();
    for (const doc of allocationSnapshot.docs) {
      const data = doc.data() || {};
      context.repository.assertEntityIsolation(data);
      if (!transactionIds.has(String(data.transactionId || ''))) continue;
      const list = allocationsByTransaction.get(data.transactionId) || [];
      list.push({ id: doc.id, ...data });
      allocationsByTransaction.set(data.transactionId, list);
    }

    const linkedTransactionsByEvidence = new Map<string, string[]>();
    const transactionRows = txSnapshot.docs.map((doc: any) => {
      const data = doc.data() || {};
      context.repository.assertEntityIsolation(data);
      const allocations = (allocationsByTransaction.get(doc.id) || [])
        .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
      const evidenceIds = Array.isArray(data.evidenceIds)
        ? data.evidenceIds.filter((value: unknown): value is string => typeof value === 'string')
        : [];
      for (const evidenceId of evidenceIds) {
        const linked = linkedTransactionsByEvidence.get(evidenceId) || [];
        if (!linked.includes(doc.id)) linked.push(doc.id);
        linkedTransactionsByEvidence.set(evidenceId, linked);
      }
      return {
        transactionId: doc.id,
        occurredAt: toIso(data.occurredAt) || '',
        competenceDate: data.competenceDate || '',
        transactionKind: data.transactionKind || data.direction || '',
        status: data.status || '',
        amount: money(data.amountCents),
        currency: data.currency || 'BRL',
        counterparty: data.counterparty || '',
        description: data.description || '',
        account: data.accountSnapshot?.name || data.accountId || data.sourceAccountId || '',
        paymentMethod: data.paymentMethod || '',
        reconciliationStatus: data.reconciliationStatus || 'unknown',
        categories: allocations.map((item) => item.categorySnapshot?.name || item.categoryId || '').filter(Boolean),
        funds: allocations.map((item) => item.fundSnapshot?.name || item.fundId || '').filter(Boolean),
        costCenters: allocations.map((item) => item.costCenterId || '').filter(Boolean),
        evidenceIds,
        justification: data.evidenceJustification || '',
      };
    });

    const evidenceRows = evidenceSnapshot.docs.map((doc: any) => {
      const data = doc.data() || {};
      if (data.organizationId !== organizationId || data.financeEntityId !== financeEntityId) {
        throw new Error('FINANCE_ENTITY_MISMATCH');
      }
      return {
        evidenceId: doc.id,
        createdAt: toIso(data.createdAt) || '',
        filename: data.originalFilename || '',
        documentType: data.classification?.documentType || data.transactionAnalysis?.analysis?.documentType?.value || '',
        processingState: data.processingState || '',
        reviewStatus: data.review?.status || '',
        duplicate: data.duplicate === true ? 'yes' : 'no',
        linkedTransactionIds: linkedTransactionsByEvidence.get(doc.id) || [],
      };
    });

    const pendingRows = transactionRows
      .filter((row) =>
        !['posted', 'reversed'].includes(String(row.status)) ||
        Boolean(row.justification) ||
        row.reconciliationStatus === 'unreconciled',
      )
      .map((row) => ({
        transactionId: row.transactionId,
        occurredAt: row.occurredAt,
        status: row.status,
        amount: row.amount,
        counterparty: row.counterparty,
        justification: row.justification,
        reconciliationStatus: row.reconciliationStatus,
        evidenceCount: Array.isArray(row.evidenceIds) ? row.evidenceIds.length : 0,
      }));

    const generatedAt = new Date().toISOString();
    const manifest = buildAccountantManifest({
      organizationId,
      financeEntityId,
      period: period.key,
      generatedAt,
      transactionCount: transactionRows.length,
      evidenceCount: evidenceRows.length,
      pendingCount: pendingRows.length,
      closeReviewState: closeModel.response.humanReview?.state || closeModel.response.readiness.state,
    });

    return res.status(200).json({
      period: period.key,
      layout,
      files: [
        {
          filename: `nestfinance-${period.key}-transactions.csv`,
          mimeType: 'text/csv;charset=utf-8',
          content: buildCsv(transactionRows, layout.transactionColumns),
        },
        {
          filename: `nestfinance-${period.key}-evidence-index.csv`,
          mimeType: 'text/csv;charset=utf-8',
          content: buildCsv(evidenceRows, layout.evidenceColumns),
        },
        {
          filename: `nestfinance-${period.key}-pending-justifications-reconciliation.csv`,
          mimeType: 'text/csv;charset=utf-8',
          content: buildCsv(pendingRows, layout.pendingColumns),
        },
        {
          filename: `nestfinance-${period.key}-manifest.json`,
          mimeType: 'application/json;charset=utf-8',
          content: JSON.stringify(manifest, null, 2) + '\n',
        },
        {
          filename: `nestfinance-${period.key}-README.txt`,
          mimeType: 'text/plain;charset=utf-8',
          content: textFileHeader(period.key, generatedAt),
        },
      ],
      manifest,
      financialMutation: false,
      postingCertificationSeparate: true,
    });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (error?.status) return res.status(error.status).json({ error: error.error || message || 'REQUEST_FAILED' });
    if (message === 'FORBIDDEN_FINANCE_ACCESS' || message === 'Session not granted') return res.status(403).json({ error: 'FORBIDDEN' });
    if (message === 'FINANCE_ENTITY_NOT_FOUND') return res.status(404).json({ error: message });
    if (message === 'FINANCE_ENTITY_NOT_ACTIVE') return res.status(409).json({ error: message });
    if (message === 'FINANCE_ENTITY_MISMATCH') return res.status(409).json({ error: message });
    console.error('Accountant Package Export Error:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
