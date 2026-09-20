import fs from 'node:fs';
import assert from 'node:assert/strict';
import { NESTFINANCE_CLOUD_RUN_ROUTES, NESTFINANCE_DIRECT_GATEWAY_ROUTES } from '../cloudrunRoutes.js';

const firebase = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
assert.equal(firebase?.firestore?.rules, 'firestore.rules', 'Firestore Rules contract must remain untouched');
assert.equal(firebase?.firestore?.indexes, 'firestore.indexes.json', 'Firestore indexes contract must remain untouched');
assert.equal(firebase?.hosting?.target, 'nestfinance');
assert.equal(firebase?.hosting?.public, 'dist');
assert.equal(firebase?.hosting?.rewrites?.[0]?.source, '/api/**');
assert.equal(firebase?.hosting?.rewrites?.[0]?.run?.serviceId, 'nestfinance-api');
assert.equal(firebase?.hosting?.rewrites?.[0]?.run?.region, 'us-central1');
assert.equal(firebase?.hosting?.rewrites?.[0]?.run?.pinTag, true);
assert.deepEqual(firebase?.hosting?.rewrites?.at(-1), { source: '**', destination: '/index.html' });

const rc = JSON.parse(fs.readFileSync('.firebaserc', 'utf8'));
assert.deepEqual(rc?.targets?.millionsnest?.hosting?.nestfinance, ['mn-nestfinance-555464791734']);

const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
assert.equal(vercel?.git?.deploymentEnabled, false, 'Vercel rollback must remain manual-only');

const expectedRoutes: Record<string, { gateway: string; operation: string }> = {};
for (const rewrite of vercel.rewrites ?? []) {
  if (!rewrite.source?.startsWith('/api/')) continue;
  const [destination, query = ''] = String(rewrite.destination).split('?');
  const operationPair = query.split('&').find((part: string) => part.startsWith('operation='));
  const operation = operationPair ? decodeURIComponent(operationPair.slice('operation='.length)) : null;
  const gateway =
    destination.includes('auth-gateway') ? 'auth' :
    destination.includes('finance-gateway') ? 'finance' :
    destination.includes('system-gateway') ? 'system' : null;
  assert.ok(gateway && operation, `Unrecognized public API rewrite: ${rewrite.source}`);
  expectedRoutes[rewrite.source] = { gateway, operation };
}
assert.deepEqual(NESTFINANCE_CLOUD_RUN_ROUTES, expectedRoutes, 'Cloud Run must expose exactly the current public Vercel API contract');
assert.equal(Object.keys(NESTFINANCE_CLOUD_RUN_ROUTES).length, 29, 'Unexpected public API surface change');
assert.deepEqual(
  NESTFINANCE_DIRECT_GATEWAY_ROUTES,
  {
    '/api/auth-gateway': 'auth',
    '/api/finance-gateway': 'finance',
    '/api/system-gateway': 'system',
  },
  'Cloud Run must preserve the direct gateway URLs already used by the SPA and Vercel runtime',
);

const cloudRunSource = fs.readFileSync('cloudrun.ts', 'utf8');
for (const gatewayPath of Object.keys(NESTFINANCE_DIRECT_GATEWAY_ROUTES)) {
  assert.ok(cloudRunSource.includes(gatewayPath), `Cloud Run adapter missing direct gateway route: ${gatewayPath}`);
}

const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
assert.match(dockerfile, /node:22-bookworm-slim/);
assert.match(dockerfile, /npm run build:cloudrun/);
assert.match(dockerfile, /FIREBASE_PROJECT_ID=millionsnest/);
assert.doesNotMatch(dockerfile, /FIREBASE_PRIVATE_KEY=|FIREBASE_CLIENT_EMAIL=|GEMINI_API_KEY=/);

const adminSource = fs.readFileSync('api/_lib/firebaseAdmin.ts', 'utf8');
assert.match(adminSource, /credential\.applicationDefault\(\)/, 'Cloud Run must support ADC');
assert.match(adminSource, /credential\.cert\(/, 'Vercel credential fallback must remain during migration');

console.log('NestFinance Firebase Hosting + Cloud Run migration contract: OK');


const productionRelease = fs.readFileSync('.github/workflows/nestfinance-production-release.yml', 'utf8');
for (const required of [
  'branches: [ production ]',
  'Deploy Firestore indexes',
  'Deploy Firestore rules',
  'Push Cloud Run image',
  'Deploy Cloud Run revision',
  'Deploy Firebase Hosting',
  'Smoke production through Firebase Hosting',
  'NESTFINANCE_RELEASE_SHA=$GITHUB_SHA',
  'NESTFINANCE_FIREBASE_EXACT_SHA_OK',
  '/api/finance-gateway?operation=transactions-summary',
]) {
  assert.ok(productionRelease.includes(required), `Production release contract missing: ${required}`);
}

const releaseOrder = [
  'Deploy Firestore indexes',
  'Deploy Firestore rules',
  'Push Cloud Run image',
  'Deploy Cloud Run revision',
  'Deploy Firebase Hosting',
  'Smoke production through Firebase Hosting',
].map((label) => productionRelease.indexOf(label));
assert.ok(releaseOrder.every((index) => index >= 0), 'Production release stages must all exist');
assert.deepEqual(
  [...releaseOrder].sort((a, b) => a - b),
  releaseOrder,
  'Production release stages must remain in the certified order',
);

assert.doesNotMatch(
  productionRelease,
  /gcloud projects add-iam-policy-binding|roles\/firebaserules\.admin|roles\/datastore\.indexAdmin/,
  'Application production release must never self-modify project IAM',
);

for (const legacyWorkflow of [
  '.github/workflows/firebase-hosting-deploy.yml',
  '.github/workflows/cloudrun-private-deploy.yml',
  '.github/workflows/firebase-staging-certification.yml',
]) {
  const source = fs.readFileSync(legacyWorkflow, 'utf8');
  const triggerBlock = source.slice(source.indexOf('on:'), source.indexOf('permissions:'));
  assert.match(triggerBlock, /workflow_dispatch:/, `${legacyWorkflow} must remain available as manual fallback`);
  assert.doesNotMatch(triggerBlock, /\bpush:/, `${legacyWorkflow} must not race the atomic production release`);
}
