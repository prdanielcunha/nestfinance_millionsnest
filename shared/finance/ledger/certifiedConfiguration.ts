import { canonicalStringify, compareCanonicalId } from './postingPlan.js';
import { createHash } from 'node:crypto';
import type { PostingMappingSnapshot, PostingPreviewPolicy } from './postingMappings.js';

export type CertifiedLedgerConfiguration = {
  schemaVersion: 1;
  enabled: boolean;
  version: number;
  firstPeriod: string;
  timeZone: string;
  currency: 'BRL';
  dateBasis: 'occurred_at' | 'competence_date';
  openingEquityAccountId: string;
  accounts: Array<{ id: string; name: string; type: 'asset'|'liability'|'equity'|'income'|'expense'; normalBalance: 'debit'|'credit'; active: boolean; postingAllowed: boolean }>;
  financeAccounts: PostingMappingSnapshot['financeAccounts'];
  categories: PostingMappingSnapshot['categories'];
};
export const ledgerId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,128}$/.test(value);
export function ledgerFailure(code: string): never { throw Object.assign(new Error(code), { code, status: 409 }); }
export function validateLedgerConfiguration(raw: unknown): CertifiedLedgerConfiguration {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) ledgerFailure('LEDGER_CONFIGURATION_INVALID');
  const c = raw as CertifiedLedgerConfiguration;
  if (c.schemaVersion !== 1 || typeof c.enabled !== 'boolean' || !Number.isSafeInteger(c.version) || c.version < 1 ||
      !/^20\d{2}-(0[1-9]|1[0-2])$/.test(c.firstPeriod) || c.currency !== 'BRL' ||
      !['occurred_at','competence_date'].includes(c.dateBasis) || !ledgerId(c.openingEquityAccountId) ||
      typeof c.timeZone !== 'string' || !c.timeZone.trim() || c.timeZone.length > 100) ledgerFailure('LEDGER_CONFIGURATION_INVALID');
  try { new Intl.DateTimeFormat('en', {timeZone:c.timeZone}).format(); } catch { ledgerFailure('LEDGER_TIME_ZONE_INVALID'); }
  for (const rows of [c.accounts,c.financeAccounts,c.categories]) if (!Array.isArray(rows) || rows.length > 200) ledgerFailure('LEDGER_CONFIGURATION_LIMIT');
  if (!c.accounts.length || !c.financeAccounts.length) ledgerFailure('LEDGER_CONFIGURATION_INCOMPLETE');
  const accounts = new Map<string,CertifiedLedgerConfiguration['accounts'][number]>();
  for (const a of c.accounts) {
    if (!a || !ledgerId(a.id) || accounts.has(a.id) || typeof a.name !== 'string' || a.name.trim().length < 2 || a.name.length > 120 ||
        !['asset','liability','equity','income','expense'].includes(a.type) || !['debit','credit'].includes(a.normalBalance) ||
        typeof a.active !== 'boolean' || typeof a.postingAllowed !== 'boolean') ledgerFailure('LEDGER_ACCOUNT_INVALID');
    accounts.set(a.id,a);
  }
  const equity = accounts.get(c.openingEquityAccountId);
  if (!equity || equity.type !== 'equity' || !equity.active || !equity.postingAllowed) ledgerFailure('LEDGER_OPENING_EQUITY_REQUIRED');
  for (const [rows,key] of [[c.financeAccounts,'accountId'],[c.categories,'categoryId']] as const) {
    const seen = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== 'object') ledgerFailure('LEDGER_MAPPING_INVALID');
      const id = (row as any)[key], a = accounts.get(row.ledgerAccountId);
      if (!ledgerId(id) || seen.has(id) || !a || !a.active || !a.postingAllowed) ledgerFailure('LEDGER_MAPPING_INVALID');
      seen.add(id);
      if (key === 'accountId' ? a.type !== (row as any).type || !['asset','liability'].includes(a.type) : a.type !== (row as any).kind || !['income','expense'].includes(a.type)) ledgerFailure('LEDGER_MAPPING_TYPE_MISMATCH');
      if (key === 'accountId' && a.normalBalance !== (a.type === 'asset' ? 'debit' : 'credit')) ledgerFailure('LEDGER_MAPPING_TYPE_MISMATCH');
    }
  }
  return c;
}
export function ledgerConfigurationKey(entity: string) {
  if (!ledgerId(entity)) ledgerFailure('LEDGER_SCOPE_INVALID');
  return 'ledger_configuration_' + createHash('sha256').update(entity).digest('hex');
}
export function certifiedPlanReferences(c: CertifiedLedgerConfiguration, organizationId: string, financeEntityId: string) {
  validateLedgerConfiguration(c);
  const mappings: PostingMappingSnapshot = {
    financeAccounts:[...c.financeAccounts].sort((a,b)=>compareCanonicalId(a.accountId,b.accountId)),
    categories:[...c.categories].sort((a,b)=>compareCanonicalId(a.categoryId,b.categoryId)),
  };
  const policy: PostingPreviewPolicy = {ledgerAccounts:c.accounts.map(a=>({...a,organizationId,financeEntityId})).sort((a,b)=>compareCanonicalId(a.id,b.id))};
  return {mappings,policy,referenceFingerprintHash:createHash('sha256').update(canonicalStringify({configurationVersion:c.version,firstPeriod:c.firstPeriod,timeZone:c.timeZone,currency:c.currency,dateBasis:c.dateBasis,openingEquityAccountId:c.openingEquityAccountId,mappings,policy})).digest('hex')};
}
export function ledgerDate(value: unknown, timeZone: string): string {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') ledgerFailure('LEDGER_DATE_INVALID');
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(value+'T12:00:00Z');
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== value) ledgerFailure('LEDGER_DATE_INVALID');
    return value;
  }
  const v = value as any;
  const date = v?.toDate instanceof Function ? v.toDate() : new Date(v);
  if (!date || !Number.isFinite(date.getTime())) ledgerFailure('LEDGER_DATE_INVALID');
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  return ['year','month','day'].map(type=>parts.find(p=>p.type===type)!.value).join('-');
}
