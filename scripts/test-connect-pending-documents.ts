import assert from 'node:assert/strict';
import { createConnectPendingDocumentsHandler } from '../server/vercel-handlers/finance/connectPendingDocuments.js';
class Result {
  statusCode = 200; body: any; headers = {};
  status(code: number) { this.statusCode = code; return this; }
  json(body: unknown) { this.body = body; return this; }
  setHeader(key: string, value: string) { this.headers[key] = value; return this; }
}
const request = { method: 'POST', headers: { authorization: 'Bearer synthetic-channel-token', 'x-organization-id': 'synthetic-org-a' }, body: { financeEntityId: 'synthetic-entity-a' } };
let delegated = 0;
const handler = createConnectPendingDocumentsHandler(async (req, res) => {
  delegated++;
  assert.deepEqual(req.headers, request.headers);
  assert.deepEqual(req.body, { financeEntityId: 'synthetic-entity-a', pageSize: 1 });
  return res.status(200).json({ items: [{ originalFilename: 'PRIVATE', storagePath: 'PRIVATE', evidenceId: 'PRIVATE' }], requestId: 'PRIVATE', summary: { total: 42, awaitingUpload: 2, needsClassification: 3, pendingReview: 4, internalSecret: 'PRIVATE' } });
});
const result = new Result(); await handler(request as any, result as any);
assert.equal(result.statusCode, 200);
assert.deepEqual(result.body, { schemaVersion: 1, summary: { awaitingUpload: 2, needsClassification: 3, pendingReview: 4 } });
assert(!JSON.stringify(result.body).includes('PRIVATE'));
assert.equal(result.headers['Cache-Control'], 'no-store');
assert.deepEqual(request.body, { financeEntityId: 'synthetic-entity-a' });
for (const body of [null, [], { financeEntityId: '../entity' }, { financeEntityId: 'e', uid: 'injected' }, { financeEntityId: 'e', organizationId: 'org-b' }, { financeEntityId: 'e', pageSize: 50 }]) {
  const response = new Result(); await handler({ ...request, body } as any, response as any); assert.equal(response.statusCode, 400);
}
assert.equal(delegated, 1);
for (const status of [401, 403, 404, 409, 500]) {
  const response = new Result();
  await createConnectPendingDocumentsHandler(async (_, res) => res.status(status).json({ error: 'PRIVATE', requestId: 'PRIVATE' })) (request as any, response as any);
  assert.equal(response.statusCode, status); assert(!JSON.stringify(response.body).includes('PRIVATE'));
}
for (const summary of [{}, { awaitingUpload: -1, needsClassification: 1, pendingReview: 1 }, { awaitingUpload: 1.5, needsClassification: 1, pendingReview: 1 }]) {
  const response = new Result(); await createConnectPendingDocumentsHandler(async (_, res) => res.json({ summary })) (request as any, response as any); assert.equal(response.statusCode, 503);
}
// Real canonical delegate must refuse a missing bearer before querying any private entity.
const denied = new Result(); await createConnectPendingDocumentsHandler()({ ...request, headers: { 'x-organization-id': 'synthetic-org-a' } } as any, denied as any);
assert.equal(denied.statusCode, 401);
let forwardedCalls = 0;
const forwarding = createConnectPendingDocumentsHandler(async (req, res) => {
  forwardedCalls++;
  assert.equal(req.headers.authorization, 'Bearer synthetic-forwarded-user');
  assert.equal(req.headers['x-organization-id'], 'synthetic-org-a');
  assert.deepEqual(req.body, { financeEntityId: 'synthetic-entity-a', pageSize: 1 });
  // A canonical rejection must remain a rejection with no private response body.
  return res.status(403).json({ error: 'PRIVATE_RBAC_DENIAL' });
});
const forwardedRequest = { ...request, headers: { ...request.headers, authorization: 'Bearer synthetic-transport-identity', 'x-connect-user-authorization': 'Bearer synthetic-forwarded-user' } };
const forwardedResult = new Result(); await forwarding(forwardedRequest as any, forwardedResult as any);
assert.equal(forwardedResult.statusCode, 403);
assert(!JSON.stringify(forwardedResult.body).includes('PRIVATE'));
assert.equal(forwardedRequest.headers.authorization, 'Bearer synthetic-transport-identity');
const forwardedOnlyResult = new Result(); await forwarding({ ...request, headers: { 'x-organization-id': 'synthetic-org-a', 'x-connect-user-authorization': 'Bearer synthetic-forwarded-user' } } as any, forwardedOnlyResult as any);
assert.equal(forwardedOnlyResult.statusCode, 403);
for (const forwarded of ['', 'Basic forged', 'Bearer token extra', ['Bearer synthetic-forwarded-user'], 'Bearer ' + 'x'.repeat(8192)]) {
  const response = new Result();
  await forwarding({ ...request, headers: { ...request.headers, 'x-connect-user-authorization': forwarded } } as any, response as any);
  assert.equal(response.statusCode, 401);
}
assert.equal(forwardedCalls, 2);
console.log('Connect Finance summary: canonical delegate, bearer/tenant preservation, injection denial and minimal PII-free projection passed');
