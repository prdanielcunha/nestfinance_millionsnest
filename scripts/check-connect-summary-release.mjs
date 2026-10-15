import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const allowed=new Set(["server/vercel-handlers/finance/connectReadContext.ts","server/vercel-handlers/finance/connectEntities.ts","server/vercel-handlers/finance/entitiesAccessible.ts","server/vercel-handlers/finance/universalEvidenceList.ts","scripts/test-connect-read-entry.ts",'api/system-gateway.ts','server/vercel-handlers/system/connectSupportDraft.ts','src/services/connectSupportAction.ts','src/components/finance/ConnectSupportButton.tsx','src/app/layouts/ShellLayout.tsx','scripts/test-connect-support-entry.ts','docs/connect/SUPPORT_ENTRY.md','.github/workflows/nestfinance-production-release.yml','.github/workflows/nestfinance-production-functional-gate.yml','.github/workflows/nestfinance-connect-summary-quality.yml','api/finance-gateway.ts','server/vercel-handlers/finance/connectPendingDocuments.ts','scripts/check-api-contracts.mjs','scripts/test-connect-pending-documents.ts','scripts/check-connect-summary-release.mjs','docs/connect/PENDING_DOCUMENTS_CONTRACT.md']);
const head=process.env.GITHUB_SHA;
if(!/^[a-f0-9]{40}$/.test(head||''))throw new Error('CONNECT_SUMMARY_RELEASE_REF_INVALID');
const changed=execFileSync('git',['diff','--name-only',`${head}^1`,head],{encoding:'utf8'}).trim().split('\n');
if(!changed.length||changed.some(p=>!allowed.has(p)))throw new Error('CONNECT_SUMMARY_RELEASE_SCOPE_INVALID');
for(const [path,expected]of Object.entries({"server/vercel-handlers/finance/universalEvidenceList.ts":"ae3a7381f05628271a602daf0d961c5d28ba01d4","server/vercel-handlers/finance/entitiesAccessible.ts":"7ee4563285d3f502e86c5deec893e7c7cb9ca3e8","server/vercel-handlers/finance/connectEntities.ts":"6364fa0c31f1cbb0d491dc6ea7c892af1e93ec32","server/vercel-handlers/finance/connectReadContext.ts":"7be36e6f267a72fc539e310bab3ad9e2ccde1c2f",'api/system-gateway.ts':'cb3ef77107f7fb7c8b0232b61b798df4699d84c9','server/vercel-handlers/system/connectSupportDraft.ts':'6e30f70174802fe17acd345026550cc583cbdf0f','src/services/connectSupportAction.ts':'2a7ca3194e4f9e4bf97f13bd9eb21fbfd349bdc1','src/components/finance/ConnectSupportButton.tsx':'e5a5b9b89fb8ead8e4d98f51bf1a84010b8a92b7','src/app/layouts/ShellLayout.tsx':'b6acf4967bfb7fbe27473a050c9529eb0f96aa41',"server/vercel-handlers/finance/connectPendingDocuments.ts":"903d4e45f9e79a5b6b16fea9ca0a578f34812ff9","api/finance-gateway.ts":"6d52c14bddb3c3e8c1736145ac23b643930017e1"})){
 const b=readFileSync(path);if(createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex')!==expected)throw new Error('CONNECT_SUMMARY_REVIEWED_SOURCE_MISMATCH');
}
if(!readFileSync('.github/workflows/nestfinance-production-functional-gate.yml','utf8').includes('name: NestFinance Production Functional Gate'))throw new Error('CONNECT_SUMMARY_FUNCTIONAL_GATE_MISSING');
console.log('CONNECT_SUMMARY_REVIEWED_SCOPE_OK');

// Validate the actual publication fingerprints before any cloud mutation.
const publisherSource=readFileSync('.github/workflows/nestfinance-production-release.yml','utf8');
if(/GITFINANCE_/.test(publisherSource))throw new Error('CONNECT_SUMMARY_GITHUB_ENV_TYPO');
if(!publisherSource.includes('cg${GITHUB_RUN_ID}a${GITHUB_RUN_ATTEMPT}'))throw new Error('CONNECT_SUMMARY_RETRY_REVISION_UNSAFE');
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
