import fs from 'fs';
import path from 'path';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const BRAND_DIR = path.join(PUBLIC_DIR, 'brand/nestfinance/nest-flow-signature/v1');

const requiredFiles = [
  'logos/nestfinance-logo-horizontal-transparent-dark-ui.svg',
  'logos/nestfinance-logo-horizontal-transparent-light-ui.svg',
  'logos/nestfinance-logo-horizontal-no-tagline-dark.svg',
  'logos/nestfinance-logo-horizontal-no-tagline-light.svg',
  'logos/nestfinance-logo-vertical-dark.svg',
  'logos/nestfinance-logo-vertical-light.svg',
  'logos/nestfinance-logo-monochrome-white.svg',
  'logos/nestfinance-logo-monochrome-black.svg',
  'symbols/nestfinance-symbol-vector-gradient.svg',
  'symbols/nestfinance-symbol-vector-flat.svg',
  'symbols/nestfinance-symbol-white.svg',
  'symbols/nestfinance-symbol-black.svg',
  'symbols/nestfinance-symbol-gold.svg',
  'symbols/nestfinance-symbol-dark-app.svg',
  'symbols/nestfinance-symbol-light-app.svg',
  'symbols/nestfinance-symbol-gradient-transparent-2048.png',
  'icons/favicon.svg',
  'icons/favicon.ico',
  'icons/apple-touch-icon.png',
  'icons/nestfinance-app-icon-192.png',
  'icons/nestfinance-app-icon-512.png',
  'icons/nestfinance-maskable-512.png',
  'social/nestfinance-og-1200x630.jpg',
  'manifest/site.webmanifest',
];

let hasError = false;

console.log('Checking brand assets...');

for (const file of requiredFiles) {
  const filePath = path.join(BRAND_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Missing asset: ${file}`);
    hasError = true;
    continue;
  }
  
  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    console.error(`❌ Empty asset file: ${file}`);
    hasError = true;
  }

  if (file.endsWith('.svg')) {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content.includes('<svg') || !content.includes('viewBox')) {
      console.error(`❌ Invalid SVG format (missing <svg> or viewBox): ${file}`);
      hasError = true;
    }
  }
}

// Check index.html for correct references
const indexHtmlPath = path.join(process.cwd(), 'index.html');
if (fs.existsSync(indexHtmlPath)) {
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
  if (indexHtml.includes('/Logo_transp.png')) {
    console.error(`❌ index.html contains reference to old /Logo_transp.png`);
    hasError = true;
  }
  if (!indexHtml.includes('favicon.svg')) {
    console.error(`❌ index.html is missing reference to favicon.svg`);
    hasError = true;
  }
} else {
  console.error(`❌ index.html not found`);
  hasError = true;
}

if (hasError) {
  console.error('Brand assets check failed.');
  process.exit(1);
} else {
  console.log('✅ Brand assets check passed.');
  process.exit(0);
}
