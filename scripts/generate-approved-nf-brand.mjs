// Rebuilds the approved outline without fonts or image-generation drift.
// Requires sharp (build-time tooling only); never runs in the application.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require(process.env.NF_SHARP_MODULE || 'sharp');
const root = process.cwd();
const master = JSON.parse(fs.readFileSync(path.join(root, 'scripts/brand/nf-blue-master.json'), 'utf8'));
const base = 'public/brand/nestfinance/nf-continuous/v2';
const files = [];
function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
  files.push(file);
}
const defs = (dark = false) => `<defs><linearGradient id="nfBlue" x1="0" y1="1" x2="1" y2="0"><stop stop-color="${dark ? '#487FB5' : '#213F66'}"/><stop offset="1" stop-color="${dark ? '#8BBDE2' : '#649BC4'}"/></linearGradient></defs>`;
const artwork = (part, x, y, height, fill) => `<g transform="translate(${x} ${y}) scale(${height / part.height})" fill="${fill}">${part.paths.join('')}</g>`;
const svg = (w, h, body, dark = false) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs(dark)}${body}</svg>\n`;
const symbol = (fill = 'url(#nfBlue)', dark = false) => svg(512, 512, artwork(master.symbol, (512 - 440 * master.symbol.width / master.symbol.height) / 2, 36, 440, fill), dark);
const horizontal = (dark, mono) => svg(1100, 240,
  artwork(master.symbol, 12, 20, 200, mono || 'url(#nfBlue)') +
  artwork(master.wordmark, 275, 77, 108, mono || (dark ? '#F3F8F6' : '#17242C')), dark);
const vertical = (dark, mono) => svg(700, 640,
  artwork(master.symbol, (700 - 417 * master.symbol.width / master.symbol.height) / 2, 30, 417, mono || 'url(#nfBlue)') +
  artwork(master.wordmark, (700 - 84 * master.wordmark.width / master.wordmark.height) / 2, 505, 84, mono || (dark ? '#F3F8F6' : '#17242C')), dark);
for (const surface of ['dark', 'light']) {
  write(`${base}/logos/nestfinance-horizontal-${surface}.svg`, horizontal(surface === 'dark'));
  write(`${base}/logos/nestfinance-vertical-${surface}.svg`, vertical(surface === 'dark'));
}
for (const [name, fill, dark] of [['gradient', 'url(#nfBlue)', false], ['dark', 'url(#nfBlue)', true], ['flat', '#316B9B', false], ['white', '#FFFFFF', true], ['black', '#17242C', false]]) {
  write(`${base}/symbols/nestfinance-${name}.svg`, symbol(fill, dark));
}
for (const [name, fill] of [['black', '#17242C'], ['white', '#FFFFFF']]) {
  write(`${base}/logos/nestfinance-monochrome-${name}.svg`, horizontal(false, fill));
}
const icon = (maskable = false) => svg(512, 512, '<rect width="512" height="512" fill="#081216"/>' + artwork(master.symbol,
  (512 - (maskable ? 300 : 370) * master.symbol.width / master.symbol.height) / 2,
  (512 - (maskable ? 300 : 370)) / 2, maskable ? 300 : 370, 'url(#nfBlue)'), true);
write(`${base}/icons/favicon.svg`, symbol('url(#nfBlue)', true));
for (const size of [16, 32, 48, 64, 128, 180, 192, 256, 384, 512, 1024]) {
  write(`${base}/icons/nestfinance-app-icon-${size}.png`, await sharp(Buffer.from(icon())).resize(size, size).png().toBuffer());
}
write(`${base}/icons/apple-touch-icon.png`, fs.readFileSync(`${base}/icons/nestfinance-app-icon-180.png`));
for (const size of [192, 512]) {
  write(`${base}/icons/nestfinance-maskable-${size}.png`, await sharp(Buffer.from(icon(true))).resize(size,size).png().toBuffer());
}
// Modern ICO with PNG payload, preserving alpha and avoiding legacy bitmap tooling.
const icoPng = await sharp(Buffer.from(symbol('url(#nfBlue)', true))).resize(48,48).png().toBuffer();
const icoHeader = Buffer.alloc(22); icoHeader.writeUInt16LE(1,2); icoHeader.writeUInt16LE(1,4);
icoHeader[6]=48; icoHeader[7]=48; icoHeader.writeUInt16LE(1,10); icoHeader.writeUInt16LE(32,12);
icoHeader.writeUInt32LE(icoPng.length,14); icoHeader.writeUInt32LE(22,18);
write(`${base}/icons/favicon.ico`, Buffer.concat([icoHeader,icoPng]));
write(`${base}/symbols/nestfinance-gradient-transparent-2048.png`, await sharp(Buffer.from(symbol())).resize(2048,2048).png().toBuffer());
for (const [name, w, h] of [['og',1200,630],['profile',1080,1080],['story',1080,1920],['linkedin',1584,396],['x-cover',1500,500],['youtube',2560,1440]]) {
  const lockup = name === 'profile' || name === 'story' ? vertical(true) : horizontal(true);
  const ratio = name === 'profile' || name === 'story' ? 700/640 : 1100/240;
  const lw = Math.min(w*.72,h*.65*ratio), lh=lw/ratio;
  const image = await sharp(Buffer.from(lockup)).resize(Math.round(lw),Math.round(lh)).png().toBuffer();
  write(`${base}/social/nestfinance-${name}-${w}x${h}.jpg`, await sharp({ create: {width:w,height:h,channels:3,background:'#081216'}}).composite([{input:image,gravity:'centre'}]).jpeg({quality:94}).toBuffer());
}
// Keep financial capture/share contracts intact; only change visual identity paths.
const manifest = JSON.parse(fs.readFileSync('public/brand/nestfinance/nest-flow-signature/v1/manifest/site.webmanifest','utf8'));
manifest.background_color = '#081216'; manifest.theme_color = '#081216';
manifest.icons = manifest.icons.map(item => ({...item,src:item.src.replace('/nest-flow-signature/v1/', '/nf-continuous/v2/')}));
write(`${base}/manifest/site.webmanifest`, JSON.stringify(manifest,null,2)+'\n');
write(`${base}/brand-assets.json`, JSON.stringify({version:'2.0',concept:'Approved lowercase nf continuous — option 02',sourceSha256:master.sourceSha256,
  assets:files.filter(f=>f.endsWith('.svg')).map(f=>({path:f.replace(/^public/,''),format:'svg',transparent:true}))},null,2)+'\n');
// Legacy public aliases can be consumed outside the current React application.
for (const name of ['logo_horizontal.png','logo_hz.png']) write(`public/${name}`, await sharp(Buffer.from(horizontal(false))).png().toBuffer());
write('public/logo_nf.png',await sharp(Buffer.from(symbol())).png().toBuffer());
console.log(`Generated ${files.length} approved-brand assets from immutable traced paths.`);
