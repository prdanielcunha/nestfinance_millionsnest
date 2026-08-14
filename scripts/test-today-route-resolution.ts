import assert from 'assert';
import { promises as fs } from 'fs';
import path from 'path';
import FinanceLanding, { FinancePage } from '../src/pages/finance/FinancePage';
import TodayActionCenter, { TodayActionCenter as NamedTodayActionCenter } from '../src/pages/finance/TodayActionCenter';

async function listSourceFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await listSourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

async function run() {
  assert.strictEqual(FinanceLanding, TodayActionCenter);
  assert.strictEqual(FinancePage, NamedTodayActionCenter);

  const appFiles = await listSourceFiles(path.join(process.cwd(), 'src', 'app'));
  let financeLandingImportFound = false;

  for (const file of appFiles) {
    const source = await fs.readFile(file, 'utf8');
    if (source.includes('pages/finance/FinancePage')) {
      financeLandingImportFound = true;
      assert.ok(
        !source.includes('pages/finance/FinancePage.tsx'),
        `${path.relative(process.cwd(), file)} pins the retired FinancePage.tsx implementation`,
      );
    }
  }

  assert.ok(financeLandingImportFound, 'No app route imports the Finance landing module');
  console.log('✅ Finance landing resolves to TodayActionCenter through the canonical extensionless module');
}

run().catch((error) => {
  console.error('❌ Today route resolution test failed', error);
  process.exit(1);
});
