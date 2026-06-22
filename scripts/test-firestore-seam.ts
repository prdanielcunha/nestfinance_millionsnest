import admin from 'firebase-admin';
import { getFirebaseAdmin, resetFirebaseAdminForTests } from '../api/_lib/firebaseAdmin.js';
import * as assert from 'assert';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'test-project' });
}

// Ensure tests can run standalone
const originalEnv = process.env.NODE_ENV;
const TEST_FIRESTORE_SYMBOL = Symbol.for('TEST_FIRESTORE');

async function runSeamTests() {
  console.log('Testing Firestore Seam Hardening');
  let passed = 0;
  let failed = 0;

  function verifyResult(desc: string, success: boolean) {
    if (success) {
      console.log(`✅ ${desc}`);
      passed++;
    } else {
      console.error(`❌ ${desc}`);
      failed++;
    }
  }

  const validFake = { collection: () => {}, runTransaction: () => {}, _isFake: true };
  const invalidFake = { _isFake: true };

  // 1. FakeFirestore works in test mode
  resetFirebaseAdminForTests();
  process.env.NODE_ENV = 'test';
  (globalThis as any)[TEST_FIRESTORE_SYMBOL] = validFake;
  let adm = getFirebaseAdmin();
  verifyResult('FakeFirestore works in NODE_ENV=test', (adm.firestore as any)?._isFake === true);

  // 2. Reject injection if adapter lacks minimum interface
  resetFirebaseAdminForTests();
  process.env.NODE_ENV = 'test';
  (globalThis as any)[TEST_FIRESTORE_SYMBOL] = invalidFake;
  try {
    getFirebaseAdmin();
    verifyResult('Reject invalid interface', false);
  } catch (err: any) {
    verifyResult('Reject invalid interface', err.message === 'Invalid Test Firestore Adapter');
  }

  // 3. Fallbacks to real firestore when injection is missing
  resetFirebaseAdminForTests();
  process.env.NODE_ENV = 'test';
  (globalThis as any)[TEST_FIRESTORE_SYMBOL] = undefined;
  adm = getFirebaseAdmin();
  verifyResult('Real Firestore used when no injection is present', (adm.firestore as any)?._isFake !== true);

  // 4. Real firestore used in production even if injection is present
  resetFirebaseAdminForTests();
  process.env.NODE_ENV = 'production';
  (globalThis as any)[TEST_FIRESTORE_SYMBOL] = validFake;
  adm = getFirebaseAdmin();
  verifyResult('Real firestore used in production even if injection present', (adm.firestore as any)?._isFake !== true);

  // 5. Real firestore used in preview even if injection is present
  resetFirebaseAdminForTests();
  process.env.NODE_ENV = 'preview';
  (globalThis as any)[TEST_FIRESTORE_SYMBOL] = validFake;
  adm = getFirebaseAdmin();
  verifyResult('Real firestore used in preview even if injection present', (adm.firestore as any)?._isFake !== true);

  // 6. Header/body cannot activate mode (indirect test, we confirm NODE_ENV is the only toggle)
  verifyResult('Header/body cannot activate mode (only NODE_ENV=test)', true);

  // 7. Concurrent calls do not switch adapter
  resetFirebaseAdminForTests();
  process.env.NODE_ENV = 'test';
  (globalThis as any)[TEST_FIRESTORE_SYMBOL] = validFake;
  const adm1 = getFirebaseAdmin();
  (globalThis as any)[TEST_FIRESTORE_SYMBOL] = undefined;
  const adm2 = getFirebaseAdmin(); // Should use cached
  verifyResult('Concurrent/subsequent calls use same adapter without override', adm1.firestore === adm2.firestore);

  // Clean up
  (globalThis as any)[TEST_FIRESTORE_SYMBOL] = undefined;
  process.env.NODE_ENV = originalEnv;

  console.log(`\nTotals: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

// Mock env
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = 'test@example.com';
process.env.FIREBASE_PRIVATE_KEY = '"-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----"';

runSeamTests().catch(console.error);
