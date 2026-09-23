import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildDocumentIntelligenceGovernance,
  DOCUMENT_INTELLIGENCE_PROMPT_REVISION,
  normalizeCorrectionValue,
} from '../shared/finance/intelligenceGovernance';
import { buildDocumentTransactionAnalysis, DOCUMENT_TRANSACTION_PROVIDER_FIELD_KEYS, type DocumentTransactionProviderField } from '../shared/finance/documentTransactionIntelligence';

const fields: DocumentTransactionProviderField[]=DOCUMENT_TRANSACTION_PROVIDER_FIELD_KEYS.map((key)=>({key,status:'absent',observation:''}));
for(const field of fields){
  if(field.key==='document_type'){field.status='recognized';field.observation='receipt';}
  if(field.key==='transaction_kind'){field.status='recognized';field.observation='expense';}
  if(field.key==='total_amount'){field.status='recognized';field.observation='R$ 12,34';}
  if(field.key==='currency'){field.status='recognized';field.observation='BRL';}
  if(field.key==='occurred_at'){field.status='recognized';field.observation='23/09/2026';}
  if(field.key==='settlement_state'){field.status='recognized';field.observation='paid';}
  if(field.key==='document_multiplicity'){field.status='recognized';field.observation='single';}
}
const provider={fields};
const analysis=buildDocumentTransactionAnalysis({provider,categories:[],entityTaxId:null});
const governance=buildDocumentIntelligenceGovernance({
  provider,analysis,cacheKey:'a'.repeat(64),cacheHit:false,latencyMs:400,
  correctionHints:[{correctionId:'b'.repeat(32),fieldKey:'transaction_kind',correctedValue:'income'}],
});
assert.equal(governance.promptRevision,DOCUMENT_INTELLIGENCE_PROMPT_REVISION);
assert.equal(governance.fields.total_amount.band,'high');
assert.ok(governance.fields.transaction_kind.provenance.includes('human_memory_hint'));
assert.equal(normalizeCorrectionValue(' expense '),'expense');
assert.equal(normalizeCorrectionValue('<script>'),'');
assert.equal(analysis.authority.postsTransaction,false);

const endpoint=readFileSync('server/vercel-handlers/finance/universalEvidenceAnalyzeTransaction.ts','utf8');
const store=readFileSync('server/vercel-handlers/finance/intelligenceGovernanceStore.ts','utf8');
const rules=readFileSync('firestore.rules','utf8');
const panel=readFileSync('src/pages/finance/inbox/IntelligenceEnginePanel.tsx','utf8');
const providerFile=readFileSync('server/vercel-handlers/finance/documentTransactionIntelligenceProvider.ts','utf8');
const benchmark=readFileSync('scripts/benchmark-document-intelligence.ts','utf8');

assert.match(endpoint,/readIntelligenceCache/);
assert.match(endpoint,/reserveIntelligenceCall/);
assert.match(endpoint,/fallback: 'human_review'/);
assert.match(endpoint,/financialEffect: false/);
assert.match(store,/NESTFINANCE_INTELLIGENCE_DAILY_CALL_LIMIT/);
assert.match(store,/NESTFINANCE_INTELLIGENCE_EVIDENCE_ATTEMPT_LIMIT/);
assert.match(rules,/intelligenceCache/);
assert.match(rules,/intelligenceCorrections/);
assert.match(panel,/benchmark/);
assert.match(panel,/removeCorrection/);
assert.match(providerFile,/getDocumentTransactionModelName/);
assert.match(benchmark,/liveCalls:false/);
assert.match(benchmark,/accuracyDeltaPoints>=10/);
assert.match(benchmark,/correctionReduction>=0\.30/);

console.log('Roadmap Cycle 08 intelligence engine gate: PASS');
