import { FieldValue as RealFieldValue } from 'firebase-admin/firestore';
import * as assert from 'assert';
import transactionsCreateDraft from '../server/vercel-handlers/finance/transactionsCreateDraft.js';

async function testVercelImport() {
  console.log('Testing Vercel Import...');
  let failed = false;

  // We simply verify that we can call RealFieldValue.serverTimestamp() without blowing up
  try {
    const sentinel = RealFieldValue.serverTimestamp();
    assert.ok(sentinel, 'Sentinel should not be undefined');
    console.log('✅ RealFieldValue.serverTimestamp() works');
  } catch (err: any) {
    console.error('❌ RealFieldValue.serverTimestamp() failed');
    console.error(err);
    failed = true;
  }

  if (failed) {
    process.exit(1);
  }
}

testVercelImport().catch((e) => {
  console.error(e);
  process.exit(1);
});
