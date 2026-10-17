import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
// Reviewed exact source-only candidate. All other production files must remain unchanged.
const reviewedHashes = {
  "scripts/test_firebase_hosting_cloudrun_policy.ts": "08a64fd89a07ace2d711114c1ff97ef75c558a37d81bc73c198a922edec7bc03",
  ".github/workflows/nestfinance-production-release.yml": "a0a17fca6ac9b410570a4ce24fae0f17be1aac607ab3c242f66969e64ba71263",
  ".gitignore": "fc8c10371d58c0b63200b9854fe7967f21d4d907b81c030e5d3cf4a603d6d2e8",
  "Dockerfile": "a0e138ea99814d62cf96d24be25fd02dfbd4f9bf5eb202aa723301b06b10d6f2",
  "README.md": "f55c492d8b7c3a39f1370a53dc2a505c12e3bb464354d29862fe7172d57ed968",
  "docs/CONNECT_OFFICIAL_FINANCE_PENDING_EVENT.md": "7752b2a19663ea67d5108b65be2daecaacddfa82502940048a4a34cfc9c446b4",
  "package.json": "de8f723ae3df1d3f35f5e6e882df7c1b48eda857fbf425016d9c040447ecd48f",
  "server/vercel-handlers/finance/connectPendingEventPublisher.ts": "8b5ca4dbaf62950d9f0118be7510d6bf1e292be43aadc2bbb6c506eec5e61428",
  "server/vercel-handlers/finance/connectPendingReceiptOutbox.ts": "2a8a5f7fe6b4ac9ba1cd699c96de74b8301250ff170edbcae2c528508cc47d71",
  ".github/workflows/connect-source-recovery-hourly.yml": "1160d71e9837fea3f40739593275a088a2d6b68e5fbc69bd7abdca33a0aaff15",
  ".github/workflows/connect-source-recovery-production.yml": "46c2c5d503dd77b4a62362641fcf52645d595881efca7061698098d308e34d40",
  "scripts/run-connect-source-recovery.sh": "63fb84e3c4cc63c0a94ac9f6b8946170daa8fa7491aa032ccada9c2bbd79d6af",
  "scripts/test-connect-independent-recovery.ts": "8aa8d1cc9311a9a37a41050d8e2d86343ed60bff4c4fd61c1376f7afa166f29f",
  "scripts/test-connect-recovery-workflow.ts": "c414df5a692296113afbf0605e2b2c1d2af5561ad5b43e4f4461c39a12f4540b",
  "server/runConnectPendingRecovery.ts": "9764bb5caa4ec6e3469effae396461259a5c27b8ec4931c40b99d02855b35716",
  "server/vercel-handlers/finance/independentConnectPendingRecovery.ts": "c67f278d6cb54e9d7245f93f854f225bc10f90bfa5c194b91e2ab217337abc2a"
};
const allowed=new Set([...Object.keys(reviewedHashes),'scripts/check-connect-source-recovery-release.mjs']);
const head=process.env.GITHUB_SHA;
if(process.env.GITHUB_REF!=='refs/heads/production'||process.env.GITHUB_REPOSITORY!=='prdanielcunha/nestfinance_millionsnest'||!/^[a-f0-9]{40}$/.test(head||''))throw Error('SOURCE_RECOVERY_PRODUCTION_REF_REQUIRED');
const changed=execFileSync('git',['diff','--name-only',`${head}^1`,head],{encoding:'utf8'}).trim().split('\n');
if(!changed.length||changed.some(path=>!allowed.has(path)))throw Error('SOURCE_RECOVERY_REVIEWED_SCOPE_INVALID');
for(const [path,expected]of Object.entries(reviewedHashes)){
 if(createHash('sha256').update(readFileSync(path)).digest('hex')!==expected)throw Error('SOURCE_RECOVERY_REVIEWED_BYTES_CHANGED');
}
console.log('FINANCE_SOURCE_RECOVERY_EXACT_REVIEWED_SCOPE_OK');
