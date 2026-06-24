const fs = require('fs');
const execSync = require('child_process').execSync;
const files = execSync('grep -rl "const db = admin.firestore()" ./server/vercel-handlers ./api').toString().trim().split('\n');

for (const file of files) {
  if (!file) continue;
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(
    /import \{ getFirebaseAdmin \} from '([^']+)';/,
    'import { getFirebaseAdmin, getFirestoreDb } from \'$1\';'
  );
  content = content.replace(
    /const db = admin.firestore\(\);/g,
    'const db = getFirestoreDb();'
  );
  fs.writeFileSync(file, content);
  console.log('Fixed', file);
}
