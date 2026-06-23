import { promises as fs } from 'fs';
import path from 'path';

async function findFiles(dir) {
  let results = [];
  try {
    const list = await fs.readdir(dir, { withFileTypes: true });
    for (const item of list) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        results = results.concat(await findFiles(fullPath));
      } else {
        results.push(fullPath);
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return results;
}

async function main() {
  const rootDir = process.cwd();
  const apiDir = path.join(rootDir, 'api');
  const servicesDir = path.join(rootDir, 'src', 'services');
  
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
    
    publicEntrypoints.push('/' + relPath.replace(/\.(ts|js|mjs|cjs)$/, '')); // e.g. /api/finance-gateway
  }
  
  publicEntrypoints.sort();
  
  const allowedNodes = [
    '/api/auth-gateway',
    '/api/finance-gateway',
    '/api/system-gateway'
  ];
  
  const unexpected = publicEntrypoints.filter(f => !allowedNodes.includes(f));
  const missing = allowedNodes.filter(f => !publicEntrypoints.includes(f));
  
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

  // Load vercel.json rewrites
  const vercelJsonPath = path.join(rootDir, 'vercel.json');
  let rewrites = [];
  try {
    const vercelContent = await fs.readFile(vercelJsonPath, 'utf8');
    const vercelConfig = JSON.parse(vercelContent);
    rewrites = vercelConfig.rewrites || [];
  } catch (err) {
    console.warn('Could not load vercel.json. Assuming no rewrites.');
  }

  // Check frontend fetch calls
  const serviceFiles = await findFiles(servicesDir);
  let failed = false;
  for (const file of serviceFiles) {
    const content = await fs.readFile(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/fetch\((['"`])(\/.*?)(['"`]|\?)|fetch\(`\$\{([A-Z_]+)\}/);
      if (!match) continue;
      
      let route;
      if (match[4]) {
        // Variable interpolation, check if it's a known gateway path
        const varName = match[4];
        if (varName === 'FINANCE_GATEWAY_PATH') route = '/api/finance-gateway';
        else if (varName === 'AUTH_GATEWAY_PATH') route = '/api/auth-gateway';
        else if (varName === 'SYSTEM_GATEWAY_PATH') route = '/api/system-gateway';
        else continue;
      } else {
        route = match[2];
        if (!route.startsWith('/api/')) continue;
      }
      
      route = route.replace(/\.(ts|js)$/, '');
      
      // Is it a direct hit on a public entrypoint?
      if (publicEntrypoints.includes(route)) continue;

      // Does it have a rewrite destination that hits a public entrypoint?
      const rewrite = rewrites.find(r => r.source === route);
      if (!rewrite) {
        console.error(`Missing rewrite or entrypoint for route: ${route} in ${path.basename(file)}:${i + 1}`);
        failed = true;
        continue;
      }
      
      const destBase = rewrite.destination.split('?')[0].replace(/\.(ts|js)$/, '');
      if (!publicEntrypoints.includes(destBase)) {
        console.error(`Rewrite destination '${destBase}' does not match any allowed entrypoint. route: ${route} in ${path.basename(file)}:${i + 1}`);
        failed = true;
      }
    }
  }

  if (failed) {
    process.exit(1);
  }
  
  console.log(`Vercel public entrypoints: ${publicEntrypoints.length}`);
  publicEntrypoints.forEach(f => console.log(`- ${f}`));
  console.log('All frontend API routes successfully mapped to gateways.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
