const fs = require('fs');
const execSync = require('child_process').execSync;
const files = execSync('grep -rl "const { auth, firestore } = admin" ./server/vercel-handlers ./api').toString().trim().split('\n');

for (const file of files) {
  if (!file) continue;
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(
    /import \{ getFirebaseAdmin \} from '([^']+)';/,
    'import { getFirebaseAdmin, getFirestoreDb } from \'$1\';'
  );
  content = content.replace(
    /const \{ auth, firestore \} = admin;/,
    'const auth = admin.auth();\n  const firestore = getFirestoreDb();'
  );
  fs.writeFileSync(file, content);
  console.log('Fixed', file);
}
