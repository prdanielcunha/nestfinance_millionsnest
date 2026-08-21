import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { inspectPdfStructure } from '../server/vercel-handlers/finance/universalEvidencePdfInspector.js';

function pdfWithStream(data: Buffer, dictionaryExtra = '') {
  const prefix = Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${data.length}${dictionaryExtra ? ` ${dictionaryExtra}` : ''} >>\nstream\n`, 'latin1');
  const suffix = Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1');
  return Buffer.concat([prefix, data, suffix]);
}

function pdfWithTwoStreams(first: { data: Buffer; extra?: string }, second: { data: Buffer; extra?: string }) {
  const one = pdfWithStream(first.data, first.extra || '');
  const twoBody = pdfWithStream(second.data, second.extra || '').subarray(Buffer.byteLength('%PDF-1.4\n'));
  return Buffer.concat([one.subarray(0, one.length - Buffer.byteLength('%%EOF\n')), twoBody]);
}

let passed = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`✅ ${message}`);
}

const rawText = pdfWithStream(Buffer.from('BT /F1 12 Tf (Hello) Tj ET', 'latin1'));
const rawResult = inspectPdfStructure(rawText);
check(rawResult.textLayerState === 'detected', 'detects a text-showing operator in an uncompressed content stream');
check(rawResult.rawStreams === 1 && rawResult.flateStreams === 0, 'counts the analyzed raw stream deterministically');

const flatePayload = deflateSync(Buffer.from('q BT /F1 10 Tf [(Value)] TJ ET Q', 'latin1'));
const flateText = pdfWithStream(flatePayload, '/Filter /FlateDecode');
const flateResult = inspectPdfStructure(flateText);
check(flateResult.textLayerState === 'detected', 'detects text in a bounded FlateDecode stream');
check(flateResult.flateStreams === 1, 'reports one analyzed FlateDecode stream');

const oversizedInflated = deflateSync(Buffer.alloc(3 * 1024 * 1024, 0x41));
const boundedResult = inspectPdfStructure(pdfWithStream(oversizedInflated, '/Filter /FlateDecode'));
check(
  boundedResult.textLayerState === 'unknown' && boundedResult.unsupportedStreams === 1,
  'oversized decompression fails closed without unbounded inflation',
);

const noText = pdfWithStream(Buffer.from('q 100 0 0 100 0 0 cm /Im0 Do Q', 'latin1'));
const noTextResult = inspectPdfStructure(noText);
check(noTextResult.textLayerState === 'not_detected', 'returns not_detected only when analyzed streams contain no text operators');

const unsupported = pdfWithStream(Buffer.from('encoded', 'latin1'), '/Filter /ASCII85Decode');
const unsupportedResult = inspectPdfStructure(unsupported);
check(unsupportedResult.textLayerState === 'unknown' && unsupportedResult.unsupportedStreams === 1, 'unsupported non-image filters fail closed to unknown');

const imagePlusNoText = pdfWithTwoStreams(
  { data: Buffer.from('q /Im0 Do Q', 'latin1') },
  { data: Buffer.from('image-bytes', 'latin1'), extra: '/Subtype /Image /Filter /DCTDecode' },
);
const imageResult = inspectPdfStructure(imagePlusNoText);
check(imageResult.imageStreams === 1, 'counts image streams separately from text-capable content streams');
check(imageResult.textLayerState === 'not_detected', 'unsupported image compression alone does not make text-layer state unknown');

const encrypted = Buffer.concat([rawText.subarray(0, rawText.length - 6), Buffer.from('/Encrypt 9 0 R\n%%EOF\n', 'latin1')]);
const encryptedResult = inspectPdfStructure(encrypted);
check(encryptedResult.encrypted === true && encryptedResult.textLayerState === 'unknown', 'encrypted PDFs fail closed to unknown even when text operators are visible');

assert.throws(() => inspectPdfStructure(Buffer.from('not a pdf')), /EVIDENCE_NOT_PDF_BYTES/);
passed += 1;
console.log('✅ rejects bytes without the PDF magic header');

console.log(`\nUniversal Evidence PDF Inspector I2D totals: ${passed} Passed`);
