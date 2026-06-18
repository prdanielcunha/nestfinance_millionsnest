import { promises as fs } from 'fs';
import path from 'path';

async function findFiles(dir) {
  let results = [];
  const list = await fs.readdir(dir, { withFileTypes: true });
  for (const item of list) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results = results.concat(await findFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

async function main() {
  const rootDir = process.cwd();
  const apiDir = path.join(rootDir, 'api');
  
  const files = await findFiles(apiDir);
  const publicEntrypoints = [];
  
  for (const file of files) {
    const ext = path.extname(file);
    if (!['.ts', '.js', '.mjs', '.cjs'].includes(ext)) continue;
    if (file.endsWith('.d.ts')) continue;
    
    // Get relative path from root
    const relPath = path.relative(rootDir, file).split(path.sep).join('/');
    
    // Check if any segment starts with _ or .
    const segments = relPath.split('/');
    if (segments.some(seg => seg.startsWith('_') || seg.startsWith('.'))) {
      continue;
    }
    
    publicEntrypoints.push(relPath);
  }
  
  publicEntrypoints.sort();
  
  const allowed = [
    'api/auth-gateway.ts',
    'api/finance-gateway.ts',
    'api/system-gateway.ts'
  ];
  
  const unexpected = publicEntrypoints.filter(f => !allowed.includes(f));
  const missing = allowed.filter(f => !publicEntrypoints.includes(f));
  
  if (unexpected.length > 0) {
    console.error('UNEXPECTED_VERCEL_ENTRYPOINTS');
    unexpected.forEach(f => console.error(`- ${f}`));
    process.exit(1);
  }
  
  if (missing.length > 0) {
    console.error('MISSING_VERCEL_GATEWAY');
    missing.forEach(f => console.error(`- ${f}`));
    process.exit(1);
  }
  
  console.log(`Vercel public entrypoints: ${publicEntrypoints.length}`);
  publicEntrypoints.forEach(f => console.log(`- ${f}`));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
