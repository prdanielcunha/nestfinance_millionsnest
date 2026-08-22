import fs from 'fs';
import path from 'path';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const SRC_DIR = path.join(process.cwd(), 'src');
const BRAND_DIR = path.join(PUBLIC_DIR, 'brand/nestfinance/nest-flow-signature/v1');

let hasError = false;

console.log('Checking brand assets...');

function checkFileExists(filePath, context) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Missing asset (${context}): ${filePath}`);
    hasError = true;
    return false;
  }
  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    console.error(`❌ Empty asset file: ${filePath}`);
    hasError = true;
    return false;
  }
  return true;
}

function checkSvg(filePath) {
  if (filePath.endsWith('.svg') && checkFileExists(filePath, 'SVG check')) {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content.includes('<svg') || !content.includes('viewBox')) {
      console.error(`❌ Invalid SVG format (missing <svg> or viewBox): ${filePath}`);
      hasError = true;
    }
  }
}

// 1. All paths defined in src/brand/nestFinanceBrand.ts
const brandTsPath = path.join(SRC_DIR, 'brand', 'nestFinanceBrand.ts');
if (fs.existsSync(brandTsPath)) {
  const brandTsContent = fs.readFileSync(brandTsPath, 'utf-8');
  const pathRegex = /'(\/brand\/nestfinance\/nest-flow-signature\/v1\/[^']+)'/g;
  let match;
  while ((match = pathRegex.exec(brandTsContent)) !== null) {
    const assetPath = path.join(process.cwd(), 'public', match[1]);
    checkFileExists(assetPath, 'src/brand/nestFinanceBrand.ts');
    checkSvg(assetPath);
  }
} else {
  console.error(`❌ Missing file: ${brandTsPath}`);
  hasError = true;
}

// 2. All files listed in brand-assets.json
const brandAssetsJsonPath = path.join(BRAND_DIR, 'brand-assets.json');
if (fs.existsSync(brandAssetsJsonPath)) {
  try {
    const brandAssetsJson = JSON.parse(fs.readFileSync(brandAssetsJsonPath, 'utf-8'));
    brandAssetsJson.assets.forEach(asset => {
      const assetPath = path.join(process.cwd(), 'public', asset.path);
      checkFileExists(assetPath, 'brand-assets.json');
      checkSvg(assetPath);
    });
  } catch (e) {
    console.error(`❌ Error parsing brand-assets.json: ${e.message}`);
    hasError = true;
  }
} else {
  console.error(`❌ Missing file: ${brandAssetsJsonPath}`);
  hasError = true;
}

// 3. All icons listed in site.webmanifest
const manifestPath = path.join(BRAND_DIR, 'manifest', 'site.webmanifest');
if (fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    manifest.icons.forEach(icon => {
      const iconPath = path.join(process.cwd(), 'public', icon.src);
      checkFileExists(iconPath, 'site.webmanifest');
    });
  } catch (e) {
    console.error(`❌ Error parsing site.webmanifest: ${e.message}`);
    hasError = true;
  }
} else {
  console.error(`❌ Missing file: ${manifestPath}`);
  hasError = true;
}

// 4. Favicon, Apple Touch Icon and Open Graph referenced in index.html
const indexHtmlPath = path.join(process.cwd(), 'index.html');
if (fs.existsSync(indexHtmlPath)) {
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
  
  const requiredRefs = [
    '/brand/nestfinance/nest-flow-signature/v1/icons/favicon.svg',
    '/brand/nestfinance/nest-flow-signature/v1/icons/favicon.ico',
    '/brand/nestfinance/nest-flow-signature/v1/icons/apple-touch-icon.png',
    '/brand/nestfinance/nest-flow-signature/v1/social/nestfinance-og-1200x630.jpg'
  ];

  requiredRefs.forEach(ref => {
    if (!indexHtml.includes(ref)) {
      console.error(`❌ index.html is missing reference to: ${ref}`);
      hasError = true;
    }
  });

  // Check absence of legacy references
  const legacyRefs = ['Logo_transp.png', 'logo_horiz.png', 'logo_load.png'];
  legacyRefs.forEach(legacy => {
    if (indexHtml.includes(legacy)) {
      console.error(`❌ index.html contains legacy reference: ${legacy}`);
      hasError = true;
    }
  });
} else {
  console.error(`❌ index.html not found`);
  hasError = true;
}

// Helper to recursively check directories for bad patterns
function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    if (fs.statSync(dirPath).isDirectory()) {
      walkDir(dirPath, callback);
    } else {
      callback(dirPath);
    }
  });
}

// 7, 8, 9. Absence of executable references to old assets, redundant kit, and docs/ during runtime
walkDir(SRC_DIR, (filePath) => {
  const content = fs.readFileSync(filePath, 'utf-8');
  const legacyRefs = ['Logo_transp.png', 'logo_horiz.png', 'logo_load.png', 'NestFinance_Nest_Flow_Signature_Kit_Completo_v1'];
  legacyRefs.forEach(legacy => {
    if (content.includes(legacy)) {
      console.error(`❌ src file contains legacy reference ${legacy}: ${filePath}`);
      hasError = true;
    }
  });
  if (content.includes('/docs/brand/')) {
    console.error(`❌ src file contains reference to docs folder: ${filePath}`);
    hasError = true;
  }
});

if (hasError) {
  console.error('❌ Brand assets check failed.');
  process.exit(1);
} else {
  console.log('✅ Brand assets check passed.');
  process.exit(0);
}
