import * as crypto from 'crypto';

async function verifyBlockedWrites() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host) {
    console.error('❌ Emulator tests must run with FIRESTORE_EMULATOR_HOST defined');
    process.exit(1);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId || !projectId.includes('emulator')) {
    console.error('❌ projectId must securely indicate emulator context');
    process.exit(1);
  }

  console.log(`Running Security Rules Tests against: ${host} (Project: ${projectId})`);

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, msg: string) => {
    if (condition) {
      console.log(`✅ ${msg}`);
      passed++;
    } else {
      console.error(`❌ MUST FIX: ${msg}`);
      failed++;
    }
  };

  const orgId = 'org_' + crypto.randomBytes(4).toString('hex');

  // Helper to send a REST request to emulator acting as an unauthenticated or arbitrarily authenticated user
  const tryWrite = async (collection: string) => {
    // We send a direct write request to the REST API. 
    // In the emulator, without an Authorization header, this is an unauthenticated client request.
    const url = `http://${host}/v1/projects/${projectId}/databases/(default)/documents/organizations/${orgId}/${collection}?documentId=test_doc`;
    
    // Create a mock Firebase Auth token natively supported by the emulator for testing:
    // https://firebase.google.com/docs/emulator-suite/connect_firestore#rest_api
    // "Authorization: Bearer owner" creates an auth context { uid: "owner" }
    
    // We'll pass a token that claims to be the owner of the org, to ensure even the org owner CANNOT write.
    const mockTokenObj = {
      uid: orgId, // the rule says orgId == request.auth.uid gives org owner access
    };
    
    const token = Buffer.from(JSON.stringify(mockTokenObj)).toString('base64');
    // For emulator, we can just pass an unencoded string `owner` or use standard Bearer token mechanisms. 
    // Since we just want to ensure it fails ALWAYS on client (allow write: if false), we can just send no token or a token.
    // Let's send it unauthenticated first.

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          testField: { stringValue: 'hacked' }
        }
      })
    });

    return res.status;
  };

  const collections = [
    'financeTransactions',
    'financeAllocations',
    'financeAuditLogs',
    'financeIdempotency',
    'financeJournalEntries',
    'financeJournalLines',
    'financeAggregates'
  ];

  for (const coll of collections) {
    const status = await tryWrite(coll);
    // 403 means permission denied. 200 means success.
    assert(status === 403, `Direct client write blocked for ${coll} (Status: ${status})`);
  }

  console.log(`\nRules Totals: ${passed} Passed, ${failed} Failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

verifyBlockedWrites();
