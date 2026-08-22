import * as fs from 'fs';
import * as path from 'path';

const sourcePath = path.resolve('src/components/finance/FirestoreIndexRemediationCard.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');

let passed = 0;
let failed = 0;

function verify(name: string, condition: boolean) {
  if (condition) {
    console.log(`✅ ${name}`);
    passed++;
    return;
  }

  console.error(`❌ ${name}`);
  failed++;
}

console.log('Running human-safe infrastructure error UI checks...');

verify('does not render Firebase Console URLs', !source.includes('console.firebase.google.com'));
verify('does not instruct users to create a Firestore index', !source.includes('Criar índice no Firestore'));
verify('does not render developer remediation links', !source.includes('<a'));
verify('retains retry behavior', source.includes('onClick={onRetry}') && source.includes('RefreshCw'));
verify('retains optional support code', source.includes('requestId') && source.includes('supportCode'));
verify('contains Portuguese copy', source.includes('PT: {'));
verify('contains English copy', source.includes('EN: {'));
verify('contains Spanish copy', source.includes('ES: {'));
verify('uses premium foundation primitives', source.includes('<Surface') && source.includes('<Button'));
verify('announces the recoverable error accessibly', source.includes('role="alert"') && source.includes('aria-live="polite"'));

console.log(`\nHuman-safe infrastructure UI totals: ${passed} Passed, ${failed} Failed`);
process.exit(failed > 0 ? 1 : 0);
