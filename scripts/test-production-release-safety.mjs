import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const y = readFileSync('.github/workflows/nestfinance-production-release.yml', 'utf8');
const needed = [
  'Capture reversible production release baseline (all paths)',
  'PREVIOUS_FINANCE_REVISION=$PREVIOUS',
  '--revision-suffix "nf',
  '--no-traffic',
  'NESTFINANCE_EXACT_PINNED_IMAGE_REVISION_READY',
  "rev.status?.conditions?.some(c => c.type==='Ready'&&c.status==='True')",
  "rev.status?.imageDigest",
  '--to-revisions="$REVISION=100"',
  'MATCHED=false',
  'for ATTEMPT in {1..40}',
  'x.gitCommitSha!==process.env.GITHUB_SHA.slice(0,12)',
  'test "$MATCHED" = "true"',
  'Restore captured live traffic and Hosting on ANY release failure',
  'if: failure()',
  '--to-revisions="$PREVIOUS_FINANCE_REVISION=100"',
];
for (const item of needed) assert(y.includes(item), 'missing protected full release gate: ' + item);
const start = y.indexOf('      - name: Deploy and pin exact Cloud Run revision before traffic cutover');
const end = y.indexOf('      - name: Allow Firebase Hosting invocation', start);
assert(start > 0 && end > start);
const deploy = y.slice(start, end);
assert(deploy.indexOf('gcloud run deploy') < deploy.indexOf('gcloud run revisions describe'));
assert(deploy.indexOf('gcloud run revisions describe') < deploy.indexOf('gcloud run services update-traffic'));
assert(!deploy.includes('--force'));
const rollback = y.slice(y.indexOf('      - name: Restore captured live traffic and Hosting on ANY release failure'));
assert(!rollback.includes("env.CONNECT_SUMMARY_API_ONLY == 'true'"));
console.log('NestFinance full-release exact revision, wait-for-SHA and rollback invariants passed');
