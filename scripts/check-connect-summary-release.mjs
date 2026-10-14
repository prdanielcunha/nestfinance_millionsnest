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

// Validate the actual publication fingerprints before any cloud mutation.
const publisherSource=readFileSync('.github/workflows/nestfinance-production-release.yml','utf8');
if(/GITFINANCE_/.test(publisherSource))throw new Error('CONNECT_SUMMARY_GITHUB_ENV_TYPO');
const queries=[...publisherSource.matchAll(/jq -S '(\{runtime:[^']+)'/g)].map(x=>x[1]);
if(queries.length!==3)throw new Error('CONNECT_SUMMARY_CONFIG_GUARD_MISSING');
const fixture={metadata:{labels:{app:'synthetic'},annotations:{'run.googleapis.com/ingress':'all'}},spec:{template:{metadata:{labels:{app:'synthetic'},annotations:{'autoscaling.knative.dev/maxScale':'3'}},spec:{serviceAccountName:'synthetic-runtime',containers:[{image:'before',env:[{name:'NESTFINANCE_RELEASE_SHA',value:'before'},{name:'SYNTHETIC_EXISTING_CONFIG',value:'preserved'}]}]}}}};
for(const query of queries){
 const fingerprint=value=>execFileSync('jq',['-Sc',query],{input:JSON.stringify(value),encoding:'utf8'});
 const expected=fingerprint(fixture),next=structuredClone(fixture);next.spec.template.spec.containers[0].image='after';next.spec.template.spec.containers[0].env[0].value='after';
 if(fingerprint(next)!==expected)throw new Error('CONNECT_SUMMARY_IMAGE_METADATA_CHECK_FAILED');
 for(const change of [v=>v.spec.template.spec.containers[0].env[1].value='changed',v=>v.spec.template.spec.serviceAccountName='other',v=>v.spec.template.metadata.annotations['autoscaling.knative.dev/maxScale']='9',v=>v.metadata.annotations['run.googleapis.com/ingress']='internal']){const changed=structuredClone(next);change(changed);if(fingerprint(changed)===expected)throw new Error('CONNECT_SUMMARY_CONFIG_MUTATION_UNDETECTED');}
}
console.log('CONNECT_SUMMARY_REAL_JQ_CONFIG_GUARDS_OK');
