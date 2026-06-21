import { promises as fs } from 'fs';
import * as path from 'path';

async function main() {
  const handlersDir = path.join(process.cwd(), 'server', 'vercel-handlers', 'finance');
  const files = await fs.readdir(handlersDir);
  
  let violations = 0;
  
  for (const file of files) {
    if (!file.endsWith('.ts')) continue;
    const filePath = path.join(handlersDir, file);
    const code = await fs.readFile(filePath, 'utf8');

    const isDirectCollectionCall = code.match(/firestore\.collection\((['"`])organizations\1\)\.doc\([a-zA-Z0-9_]+\)\.collection\((['"`])(financeAccounts|financeFunds|financeCategories)\2\)/);
    if (isDirectCollectionCall && !code.includes('.where(')) {
       console.error(`[SAAS ISOLATION FAIL] ${file}: Unscoped collection query without .where() or accessHelpers.`);
       violations++;
    }

    if (code.match(/const\s*{\s*([^}]*)organizationId([^}]*)\s*}\s*=\s*(req\.body|JSON\.parse\([^)]+\))/)) {
      console.error(`[SAAS ISOLATION FAIL] ${file}: Extracts organizationId from req.body`);
      violations++;
    }
  }
  
  if (violations > 0) {
    console.error(`Failed with ${violations} SaaS isolation violations.`);
    process.exit(1);
  }
  
  console.log('SaaS isolation checks passed.');
}

main().catch(console.error);
