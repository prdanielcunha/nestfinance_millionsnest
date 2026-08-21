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

function pdfWithIndirectLength(data: Buffer) {
  const prefix = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Length 2 0 R >>\nstream\n', 'latin1');
  const suffix = Buffer.from('\nendstream\nendobj\n2 0 obj\n0\nendobj\n%%EOF\n', 'latin1');
  return Buffer.concat([prefix, data, suffix]);
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

const quoteText = inspectPdfStructure(pdfWithStream(Buffer.from("BT (Line) ' ET", 'latin1')));
check(quoteText.textLayerState === 'detected', 'recognizes the single-quote text-showing operator inside a text object');

const doubleQuoteText = inspectPdfStructure(pdfWithStream(Buffer.from('BT 0 0 (Line) " ET', 'latin1')));
check(doubleQuoteText.textLayerState === 'detected', 'recognizes the double-quote text-showing operator inside a text object');

const oversizedInflated = deflateSync(Buffer.alloc(3 * 1024 * 1024, 0x41));
const boundedResult = inspectPdfStructure(pdfWithStream(oversizedInflated, '/Filter /FlateDecode'));
check(
  boundedResult.textLayerState === 'unknown' && boundedResult.unsupportedStreams === 1,
  'oversized decompression fails closed without unbounded inflation',
);

const noText = pdfWithStream(Buffer.from('q 100 0 0 100 0 0 cm /Im0 Do Q', 'latin1'));
const noTextResult = inspectPdfStructure(noText);
check(noTextResult.textLayerState === 'not_detected', 'returns not_detected only when analyzed streams contain no text operators');

const commentNoise = pdfWithStream(Buffer.from('% BT (fake) Tj ET', 'latin1'));
const commentNoiseResult = inspectPdfStructure(commentNoise);
check(commentNoiseResult.textLayerState === 'not_detected', 'ignores text-like operators that occur only inside PDF comments');

const literalNoise = pdfWithStream(Buffer.from('(BT (fake) Tj ET) pop', 'latin1'));
const literalNoiseResult = inspectPdfStructure(literalNoise);
check(literalNoiseResult.textLayerState === 'not_detected', 'ignores text-like operators that occur only inside literal strings');

const hexNoise = pdfWithStream(Buffer.from('<425420546a204554> pop', 'latin1'));
const hexNoiseResult = inspectPdfStructure(hexNoise);
check(hexNoiseResult.textLayerState === 'not_detected', 'ignores text-like operators that occur only inside hexadecimal strings');

const nameNoise = pdfWithStream(Buffer.from('/BT /Tj /ET', 'latin1'));
const nameNoiseResult = inspectPdfStructure(nameNoise);
check(nameNoiseResult.textLayerState === 'not_detected', 'ignores text-like operator names instead of treating them as executable operators');

const inlineImageNoise = pdfWithStream(Buffer.from('BI /W 1 /H 1 /BPC 8 /CS /RGB ID BT Tj ET EI', 'latin1'));
const inlineImageResult = inspectPdfStructure(inlineImageNoise);
check(inlineImageResult.textLayerState === 'unknown', 'inline image syntax fails closed instead of scanning image data as text operators');

const commentedThenRealText = pdfWithStream(Buffer.from('% BT (fake) Tj ET\nBT /F1 12 Tf (Real) Tj ET', 'latin1'));
const commentedThenRealTextResult = inspectPdfStructure(commentedThenRealText);
check(commentedThenRealTextResult.textLayerState === 'detected', 'still detects a real text object after an ignored comment');

const embeddedEndstream = pdfWithStream(Buffer.from('q (endstream) pop BT /F1 12 Tf (Real) Tj ET Q', 'latin1'));
const embeddedEndstreamResult = inspectPdfStructure(embeddedEndstream);
check(embeddedEndstreamResult.textLayerState === 'detected', 'uses the declared stream length instead of truncating on endstream bytes inside content');

const fakeStreamComment = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Length 0 >>\n% stream\nBT /F1 12 Tf (Fake) Tj ET\nendstream\nendobj\n%%EOF\n', 'latin1');
const fakeStreamCommentResult = inspectPdfStructure(fakeStreamComment);
check(fakeStreamCommentResult.textLayerState === 'unknown' && fakeStreamCommentResult.analyzedStreams === 0, 'ignores stream keywords that occur only inside PDF comments');

const indirectLengthResult = inspectPdfStructure(pdfWithIndirectLength(Buffer.from('BT /F1 12 Tf (Hidden) Tj ET', 'latin1')));
check(indirectLengthResult.textLayerState === 'unknown' && indirectLengthResult.unsupportedStreams === 1, 'indirect stream lengths fail closed instead of guessing the byte boundary');

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
