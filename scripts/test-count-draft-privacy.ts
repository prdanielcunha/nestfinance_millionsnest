import assert from 'node:assert/strict';
import { countDraftPersistence } from '../src/services/countDraftPersistence.js';

// Synthetic in-memory browser storage. This test never reads real user data.
const values = new Map<string, string>();
const mockStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
};
const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: mockStorage,
});

try {
  const org = 'synthetic_org';
  const entity = 'synthetic_entity';
  const session = 'synthetic_session';
  const draft = {
    activeType: 'offering' as const,
    method: 'total' as const,
    totalRaw: '12345',
    quantities: {},
    step: 'review' as const,
  };

  values.set(
    `nestfinance_count_draft_v1:${org}:${entity}:${session}`,
    JSON.stringify({ ...draft, sessionId: session, updatedAt: 1 }),
  );
  assert.equal(countDraftPersistence.load(org, entity, session, 'user_B'), null);
  assert.equal(values.has(`nestfinance_count_draft_v1:${org}:${entity}:${session}`), true,
    'Unverified legacy drafts must not be exposed or destroyed without a recovery policy');

  countDraftPersistence.save(org, entity, session, 'user_A', draft);
  assert.equal(countDraftPersistence.load(org, entity, session, 'user_A')?.totalRaw, '12345');
  assert.equal(countDraftPersistence.load(org, entity, session, 'user_B'), null,
    'A second user on the same device must never recover A\'s draft');
  assert.equal(countDraftPersistence.load('other_org', entity, session, 'user_A'), null);
  assert.equal(countDraftPersistence.load(org, 'other_entity', session, 'user_A'), null);
  assert.equal(countDraftPersistence.load(org, entity, 'other_session', 'user_A'), null);

  countDraftPersistence.save(org, entity, session, 'user_B', { ...draft, totalRaw: '999' });
  assert.equal(countDraftPersistence.load(org, entity, session, 'user_A')?.totalRaw, '12345');
  assert.equal(countDraftPersistence.load(org, entity, session, 'user_B')?.totalRaw, '999');

  countDraftPersistence.clear(org, entity, session, 'user_A');
  assert.equal(countDraftPersistence.load(org, entity, session, 'user_A'), null);
  assert.equal(countDraftPersistence.load(org, entity, session, 'user_B')?.totalRaw, '999');

  const count = values.size;
  countDraftPersistence.save(org, entity, session, '', draft);
  assert.equal(countDraftPersistence.load(org, entity, session, ''), null);
  assert.equal(values.size, count, 'An unresolved identity must never access local drafts');
} finally {
  if (original) Object.defineProperty(globalThis, 'localStorage', original);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}

console.log('✅ Scoped Count drafts and unsafe legacy cleanup passed');
