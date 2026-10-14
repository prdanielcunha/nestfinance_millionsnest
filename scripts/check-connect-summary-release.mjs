import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const allowed=new Set(['.github/workflows/nestfinance-production-release.yml','.github/workflows/nestfinance-production-functional-gate.yml','.github/workflows/nestfinance-connect-summary-quality.yml','api/finance-gateway.ts','server/vercel-handlers/finance/connectPendingDocuments.ts','scripts/check-api-contracts.mjs','scripts/test-connect-pending-documents.ts','scripts/check-connect-summary-release.mjs','docs/connect/PENDING_DOCUMENTS_CONTRACT.md']);
const head=process.env.GITHUB_SHA;
if(!/^[a-f0-9]{40}$/.test(head||''))throw new Error('CONNECT_SUMMARY_RELEASE_REF_INVALID');
const changed=execFileSync('git',['diff','--name-only',`${head}^1`,head],{encoding:'utf8'}).trim().split('\n');
if(!changed.length||changed.some(p=>!allowed.has(p)))throw new Error('CONNECT_SUMMARY_RELEASE_SCOPE_INVALID');
for(const [path,expected]of Object.entries({'server/vercel-handlers/finance/connectPendingDocuments.ts':'5b548be602e46b375acaba92d1a017b8d32284af','api/finance-gateway.ts':'64005f60e902e236e351b03294b418de754427e4'})){
 const b=readFileSync(path);if(createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex')!==expected)throw new Error('CONNECT_SUMMARY_REVIEWED_SOURCE_MISMATCH');
}
if(!readFileSync('.github/workflows/nestfinance-production-functional-gate.yml','utf8').includes('name: NestFinance Production Functional Gate'))throw new Error('CONNECT_SUMMARY_FUNCTIONAL_GATE_MISSING');
console.log('CONNECT_SUMMARY_REVIEWED_SCOPE_OK');
