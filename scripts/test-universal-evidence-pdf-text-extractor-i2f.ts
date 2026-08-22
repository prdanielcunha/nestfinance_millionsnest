import { readFile } from 'node:fs/promises';
import {
  extractNativePdfText,
  PDF_TEXT_MAX_CHARACTERS,
  PDF_TEXT_MAX_INPUT_BYTES,
  PDF_TEXT_MAX_PAGES,
} from '../server/vercel-handlers/finance/universalEvidencePdfTextExtractor.js';

function escapePdfString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdf(pageTexts: Array<string | null>, trailerExtra = '') {
  const objects = new Map<number, Buffer>();
  const fontId = 3 + pageTexts.length * 2;
  const kids = pageTexts.map((_, index) => `${3 + index * 2} 0 R`).join(' ');
  objects.set(1, Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'));
  objects.set(2, Buffer.from(`<< /Type /Pages /Kids [${kids}] /Count ${pageTexts.length} >>`, 'latin1'));

  pageTexts.forEach((text, index) => {
    const pageId = 3 + index * 2;
    const contentId = pageId + 1;
    const payload = text === null
      ? Buffer.from('q Q', 'latin1')
      : Buffer.from(`BT /F1 12 Tf 72 720 Td (${escapePdfString(text)}) Tj ET`, 'latin1');
    objects.set(
      pageId,
      Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
        'latin1',
      ),
    );
    objects.set(
      contentId,
      Buffer.concat([
        Buffer.from(`<< /Length ${payload.length} >>\nstream\n`, 'latin1'),
        payload,
        Buffer.from('\nendstream', 'latin1'),
      ]),
    );
  });

  objects.set(fontId, Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', 'latin1'));

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets = new Array(fontId + 1).fill(0);
  let length = chunks[0].length;
  for (let id = 1; id <= fontId; id += 1) {
    offsets[id] = length;
    const object = Buffer.concat([
      Buffer.from(`${id} 0 obj\n`, 'latin1'),
      objects.get(id)!,
      Buffer.from('\nendobj\n', 'latin1'),
    ]);
    chunks.push(object);
    length += object.length;
  }

  const xrefOffset = length;
  const xrefRows = ['0000000000 65535 f '];
  for (let id = 1; id <= fontId; id += 1) {
    xrefRows.push(`${String(offsets[id]).padStart(10, '0')} 00000 n `);
  }
  chunks.push(Buffer.from(
    `xref\n0 ${fontId + 1}\n${xrefRows.join('\n')}\ntrailer\n<< /Size ${fontId + 1} /Root 1 0 R ${trailerExtra}>>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    'latin1',
  ));
  return Buffer.concat(chunks);
}

let passed = 0;
function verify(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`✅ ${message}`);
}

const source = await readFile('server/vercel-handlers/finance/universalEvidencePdfTextExtractor.ts', 'utf8');
verify(source.includes("from 'unpdf'"), 'extractor uses the pinned unpdf/PDF.js runtime');
verify(source.includes('getDocumentProxy') && source.includes('getPage') && source.includes('getTextContent'), 'extractor processes text page-by-page instead of fan-out extractText()');
verify(source.includes('maxImageSize') && source.includes('disableAutoFetch') && source.includes('disableStream'), 'PDF.js resource-related options are explicit');
verify(!source.includes('extractImages') && !source.includes('renderPageAsImage'), 'I2F never renders or extracts images');
verify(!source.includes('@google/genai') && !source.includes('generateContent') && !source.includes('Gemini'), 'I2F has no AI execution path');
verify(!source.includes('firebase-admin') && !source.includes('firestore') && !source.includes('.set(') && !source.includes('.update('), 'pure extractor has no persistence path');
verify(PDF_TEXT_MAX_INPUT_BYTES === 4 * 1024 * 1024, 'native extraction input is capped at 4 MiB');
verify(PDF_TEXT_MAX_PAGES === 40, 'native extraction is capped at 40 pages');
verify(PDF_TEXT_MAX_CHARACTERS === 100_000, 'native extraction response is capped at 100k characters');

const simple = await extractNativePdfText(buildPdf(['Hello I2F']));
verify(simple.state === 'extracted', 'valid one-page native-text PDF is extracted');
if (simple.state === 'extracted') {
  verify(simple.text.includes('Hello I2F'), 'extracted text contains the native PDF text');
  verify(simple.totalPages === 1 && simple.extractedPages === 1, 'page counts are explicit and correct');
  verify(simple.characters === simple.text.length && simple.truncated === false, 'character metadata is exact for non-truncated text');
}

const noText = await extractNativePdfText(buildPdf([null]));
verify(noText.state === 'unavailable' && noText.reason === 'text_layer_not_detected', 'PDF without supported text operators remains unavailable with no OCR fallback');

const malformedText = await extractNativePdfText(buildPdf(['Hello']).toString('latin1').includes('%%EOF')
  ? Buffer.from(buildPdf(['Hello']).toString('latin1').replace('BT /F1 12 Tf 72 720 Td (Hello) Tj ET', 'BT /F1 12 Tf (Hello) Tj'), 'latin1')
  : buildPdf(['Hello']));
verify(malformedText.state === 'unavailable' && malformedText.reason === 'structural_preflight_incomplete', 'ambiguous text object fails closed before PDF.js extraction');

const encrypted = await extractNativePdfText(buildPdf(['Secret'], '/Encrypt 99 0 R '));
verify(encrypted.state === 'unavailable' && encrypted.reason === 'encrypted', 'encrypted PDF fails closed without extraction');

const oversized = Buffer.alloc(PDF_TEXT_MAX_INPUT_BYTES + 1, 0x20);
oversized.write('%PDF-', 0, 'ascii');
const tooLarge = await extractNativePdfText(oversized);
verify(tooLarge.state === 'unavailable' && tooLarge.reason === 'input_too_large', 'oversized input is rejected before parser work');

const tooManyPages = await extractNativePdfText(buildPdf(Array.from({ length: PDF_TEXT_MAX_PAGES + 1 }, () => 'x')));
verify(tooManyPages.state === 'unavailable' && tooManyPages.reason === 'page_limit_exceeded' && tooManyPages.totalPages === PDF_TEXT_MAX_PAGES + 1, 'page fan-out is blocked before per-page extraction');

const longText = 'A'.repeat(PDF_TEXT_MAX_CHARACTERS + 4096);
const truncated = await extractNativePdfText(buildPdf([longText]));
verify(truncated.state === 'extracted', 'large but bounded native text remains extractable');
if (truncated.state === 'extracted') {
  verify(truncated.characters === truncated.text.length && truncated.text.length <= PDF_TEXT_MAX_CHARACTERS, 'native text never exceeds the 100k-character cap after normalization');
  verify(truncated.truncated === true, 'truncation is explicit rather than silent');
}

console.log(`\nUniversal Evidence Native PDF Text I2F totals: ${passed} Passed`);
