import { createHash } from 'node:crypto';
import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { validReceiptDate } from '../../../shared/finance/receivedIncome.js';
import { canonicalStringify } from '../../../shared/finance/ledger/postingPlan.js';
import { buildIdempotencyKeyHash, executeWithIdempotency, hashPayload } from './idempotencyHelper.js';
import { stageCanonicalAuditCreate } from './auditFactProjection.js';
import { isValidIdempotencyKey, isValidRequestId } from '../../../shared/finance/ledger/ids.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const fail = (code: string): never => { throw Object.assign(new Error(code), { code }); };
export const LEDGER_INITIALIZATION_MAX_REFERENCES = 150;
type Scope = { db: Firestore; organizationId: string; financeEntityId: string };
type CatalogRow = { id: string; data: Record<string, any> };

/** A plan represents an explicit, reviewable mapping of existing sources. It
 * neither invents opening amounts nor adopts previously posted history. */
export function buildLedgerInitializationPlan(input: {
  organizationId: string; financeEntityId: string; accounts: CatalogRow[]; categories: CatalogRow[]; funds: CatalogRow[];
}) {
  const { organizationId, financeEntityId } = input;
  if (input.accounts.length + input.categories.length + input.funds.length > LEDGER_INITIALIZATION_MAX_REFERENCES) fail('FINANCE_INITIALIZATION_REFERENCE_LIMIT');
  const validate = (row: CatalogRow) => {
    if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(row.id) || row.data.organizationId !== organizationId || row.data.financeEntityId !== financeEntityId) fail('FINANCE_CROSS_ENTITY_REFERENCE');
    if (typeof row.data.name !== 'string' || !row.data.name.trim() || row.data.name.length > 160 || typeof row.data.active !== 'boolean') fail('FINANCE_INITIALIZATION_REFERENCE_INVALID');
    if (row.data.ledgerMapping || row.data.ledgerConfigurationRevision) fail('FINANCE_INITIALIZATION_MAPPING_ALREADY_EXISTS');
  };
  for (const row of [...input.accounts, ...input.categories, ...input.funds]) validate(row);
  const mapped = (kind: 'account' | 'category', row: CatalogRow) => {
    const type = kind === 'account' ? row.data.nature : row.data.kind;
    if (!(kind === 'account' ? ['asset', 'liability'] : ['income', 'expense']).includes(type)) fail('FINANCE_INITIALIZATION_REFERENCE_INVALID');
    if (kind === 'account' && (row.data.currency !== 'BRL' || row.data.configurationStatus !== 'complete')) fail('FINANCE_ACCOUNT_CONFIGURATION_INCOMPLETE');
    const ledgerAccountId = 'la_' + digest(`${organizationId}:${financeEntityId}:${kind}:${row.id}`).slice(0, 40);
    return { sourceId: row.id, sourceCollection: kind === 'account' ? 'financeAccounts' : 'financeCategories',
      sourceHash: hashPayload(row.data), ledgerAccount: { id: ledgerAccountId, organizationId, financeEntityId,
        name: row.data.name, type, normalBalance: ['asset', 'expense'].includes(type) ? 'debit' : 'credit',
        active: row.data.active, postingAllowed: row.data.active, version: 1 } };
  };
  const mappings = [...input.accounts.map(row => mapped('account', row)), ...input.categories.map(row => mapped('category', row))]
    .sort((a, b) => a.sourceCollection.localeCompare(b.sourceCollection) || a.sourceId.localeCompare(b.sourceId));
  if (!input.accounts.some(row => row.data.active)) fail('FINANCE_INITIALIZATION_ACTIVE_ACCOUNT_REQUIRED');
  const material = { organizationId, financeEntityId, mappings,
    funds: input.funds.map(row => ({ id: row.id, sourceHash: hashPayload(row.data) })).sort((a, b) => a.id.localeCompare(b.id)) };
  return { ...material, fingerprint: 'sha256:' + digest(canonicalStringify(material)), schemaVersion: 1 };
}

async function load(scope: Scope, t: Transaction) {
  const org = scope.db.collection('organizations').doc(scope.organizationId);
  const scoped = (collection: string) => org.collection(collection).where('financeEntityId', '==', scope.financeEntityId);
  const [configuration, accounts, categories, funds, posted, journals] = await Promise.all([
    t.get(org.collection('financeLedgerExecution').doc(scope.financeEntityId)),
    t.get(scoped('financeAccounts').limit(151)), t.get(scoped('financeCategories').limit(151)), t.get(scoped('financeFunds').limit(151)),
    t.get(scoped('financeTransactions').where('status', 'in', ['posted', 'reversed']).limit(1)),
    t.get(scoped('financeJournalEntries').limit(1)),
  ]);
  if (configuration.exists) return { configuration: configuration.data(), plan: null };
  if (!posted.empty || !journals.empty) fail('FINANCE_LEDGER_HISTORY_MIGRATION_REQUIRED');
  const rows = (snapshot: typeof accounts) => snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
  return { configuration: null, plan: buildLedgerInitializationPlan({ ...scope, accounts: rows(accounts), categories: rows(categories), funds: rows(funds) }) };
}

export async function previewLedgerInitialization(scope: Scope) {
  return scope.db.runTransaction(t => load(scope, t));
}

export async function initializeLedger(scope: Scope & { actorUid: string; command: {
  effectiveStartDate: string; expectedFingerprint: string; reason: string; idempotencyKey: string; requestId: string;
} }) {
  const { command } = scope;
  const reason = typeof command.reason === 'string' ? command.reason.trim() : '';
  if (!validReceiptDate(command.effectiveStartDate) || !/^sha256:[a-f0-9]{64}$/.test(command.expectedFingerprint) ||
    reason.length < 10 || reason.length > 500 || !isValidIdempotencyKey(command.idempotencyKey) || !isValidRequestId(command.requestId)) fail('FINANCE_INITIALIZATION_INVALID_COMMAND');
  const org = scope.db.collection('organizations').doc(scope.organizationId);
  const keyHash = buildIdempotencyKeyHash(scope.organizationId, scope.financeEntityId, scope.actorUid, 'ledger_initialize', command.idempotencyKey);
  return executeWithIdempotency(scope.db, org.collection('financeIdempotency'), keyHash, hashPayload({ ...command, requestId: null, reason }), async t => {
    const { plan, configuration } = await load(scope, t);
    if (configuration || !plan) fail('FINANCE_LEDGER_ALREADY_INITIALIZED');
    if (plan.fingerprint !== command.expectedFingerprint) fail('FINANCE_INITIALIZATION_VERSION_CONFLICT');
    const refs = plan.mappings.map(row => org.collection('financeLedgerAccounts').doc(row.ledgerAccount.id));
    const existing = refs.length ? await t.getAll(...refs) : [];
    if (existing.some(doc => doc.exists)) fail('FINANCE_INITIALIZATION_MAPPING_ALREADY_EXISTS');
    for (const row of plan.mappings) {
      t.create(org.collection('financeLedgerAccounts').doc(row.ledgerAccount.id), { ...row.ledgerAccount, createdAt: FieldValue.serverTimestamp(), createdBy: scope.actorUid });
      t.update(org.collection(row.sourceCollection).doc(row.sourceId), { ledgerMapping: row.ledgerAccount.id, ledgerConfigurationRevision: 1 });
    }
    for (const fund of plan.funds) t.update(org.collection('financeFunds').doc(fund.id), { ledgerConfigurationRevision: 1 });
    const record = { organizationId: scope.organizationId, financeEntityId: scope.financeEntityId,
      state: 'ready', schemaVersion: 1, revision: 1, initializationMode: 'empty_posted_history', baselineTransactionCount: 0,
      effectiveStartDate: command.effectiveStartDate, sourceFingerprint: plan.fingerprint,
      initializedBy: scope.actorUid, initializedAt: FieldValue.serverTimestamp(), openingBalancesVerified: false };
    const ref = org.collection('financeLedgerExecution').doc(scope.financeEntityId);
    t.create(ref, record);
    const auditId = 'audit_' + digest('initialize:' + scope.financeEntityId);
    stageCanonicalAuditCreate(t, scope.db, org.collection('financeAuditLogs').doc(auditId), {
      eventId: auditId, organizationId: scope.organizationId, financeEntityId: scope.financeEntityId, actor: scope.actorUid,
      resource: 'ledger_configuration', resourceId: scope.financeEntityId, action: 'ledger.initialized',
      requestId: command.requestId, idempotencyKey: command.idempotencyKey, createdAt: FieldValue.serverTimestamp(),
      metadata: { reason, versionBefore: 0, versionAfter: 1, effectiveStartDate: command.effectiveStartDate,
        fingerprint: plan.fingerprint, approvedMappings: plan.mappings, openingBalancesVerified: false },
    });
    return { financeEntityId: scope.financeEntityId, state: 'ready', revision: 1, effectiveStartDate: command.effectiveStartDate };
  });
}
