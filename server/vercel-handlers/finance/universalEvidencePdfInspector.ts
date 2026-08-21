import { inflateSync } from 'node:zlib';

export type PdfTextLayerState = 'detected' | 'not_detected' | 'unknown';

export type PdfStructureInspection = {
  version: 1;
  parser: 'pdf-structure-v1';
  encrypted: boolean;
  textLayerState: PdfTextLayerState;
  analyzedStreams: number;
  rawStreams: number;
  flateStreams: number;
  imageStreams: number;
  unsupportedStreams: number;
  limited: boolean;
};

const MAX_STREAMS = 256;
const MAX_STREAM_DICTIONARY_CHARS = 16 * 1024;
const MAX_COMPRESSED_STREAM_BYTES = 2 * 1024 * 1024;
const MAX_INFLATED_STREAM_BYTES = 2 * 1024 * 1024;
const PDF_HEADER = Buffer.from('%PDF-', 'ascii');

function isWhitespaceCode(code: number | undefined) {
  return code === 0 || code === 9 || code === 10 || code === 12 || code === 13 || code === 32;
}

function hasPdfHeader(bytes: Buffer) {
  return bytes.length >= PDF_HEADER.length && bytes.subarray(0, PDF_HEADER.length).equals(PDF_HEADER);
}

function hasTextShowingOperator(value: string) {
  const begin = /(^|[\s\x00])BT(?=[\s\x00])/g;
  let match: RegExpExecArray | null;
  while ((match = begin.exec(value)) !== null) {
    const start = match.index + match[0].length;
    const end = value.indexOf('ET', start);
    if (end < 0) return false;
    const block = value.slice(start, Math.min(end, start + 512 * 1024));
    if (/\bTj\b|\bTJ\b|(^|\s)'(?=\s|$)|(^|\s)"(?=\s|$)/m.test(block)) return true;
    begin.lastIndex = end + 2;
  }
  return false;
}

function findDictionary(text: string, streamIndex: number) {
  const dictEnd = text.lastIndexOf('>>', streamIndex);
  if (dictEnd < 0 || streamIndex - dictEnd > 256) return null;
  const lowerBound = Math.max(0, dictEnd - MAX_STREAM_DICTIONARY_CHARS);
  const dictStart = text.lastIndexOf('<<', dictEnd);
  if (dictStart < lowerBound) return null;
  return text.slice(dictStart, dictEnd + 2);
}

function filterKind(dictionary: string): 'raw' | 'flate' | 'unsupported' {
  if (!/\/Filter\b/.test(dictionary)) return 'raw';
  const simple = dictionary.match(/\/Filter\s*\/(FlateDecode|Fl)\b/);
  if (simple && !/\/Filter\s*\[/.test(dictionary)) return 'flate';
  return 'unsupported';
}

function decodeStream(bytes: Buffer, kind: 'raw' | 'flate') {
  if (kind === 'raw') return bytes;
  if (bytes.length > MAX_COMPRESSED_STREAM_BYTES) return null;
  try {
    return inflateSync(bytes, { maxOutputLength: MAX_INFLATED_STREAM_BYTES });
  } catch {
    return null;
  }
}

export function inspectPdfStructure(bytes: Buffer): PdfStructureInspection {
  if (!hasPdfHeader(bytes)) throw new Error('EVIDENCE_NOT_PDF_BYTES');

  const documentText = bytes.toString('latin1');
  const encrypted = /\/Encrypt\b/.test(documentText);
  let cursor = 0;
  let streamsSeen = 0;
  let analyzedStreams = 0;
  let rawStreams = 0;
  let flateStreams = 0;
  let imageStreams = 0;
  let unsupportedStreams = 0;
  let detected = false;
  let limited = false;

  while (cursor < bytes.length) {
    const streamIndex = documentText.indexOf('stream', cursor);
    if (streamIndex < 0) break;
    cursor = streamIndex + 6;

    const before = streamIndex > 0 ? bytes[streamIndex - 1] : undefined;
    const after = bytes[streamIndex + 6];
    if (!isWhitespaceCode(before) || !isWhitespaceCode(after)) continue;

    streamsSeen += 1;
    if (streamsSeen > MAX_STREAMS) {
      limited = true;
      break;
    }

    const dictionary = findDictionary(documentText, streamIndex);
    if (!dictionary) {
      unsupportedStreams += 1;
      continue;
    }

    let dataStart = streamIndex + 6;
    if (bytes[dataStart] === 13 && bytes[dataStart + 1] === 10) dataStart += 2;
    else if (bytes[dataStart] === 10 || bytes[dataStart] === 13) dataStart += 1;

    const endStreamIndex = documentText.indexOf('endstream', dataStart);
    if (endStreamIndex < 0) {
      unsupportedStreams += 1;
      break;
    }
    cursor = endStreamIndex + 9;

    const isImage = /\/Subtype\s*\/Image\b/.test(dictionary);
    if (isImage) imageStreams += 1;

    const kind = filterKind(dictionary);
    if (kind === 'unsupported') {
      if (!isImage) unsupportedStreams += 1;
      continue;
    }

    let streamBytes = bytes.subarray(dataStart, endStreamIndex);
    while (streamBytes.length > 0 && (streamBytes.at(-1) === 10 || streamBytes.at(-1) === 13)) {
      streamBytes = streamBytes.subarray(0, streamBytes.length - 1);
    }

    const decoded = decodeStream(streamBytes, kind);
    if (!decoded) {
      if (!isImage) unsupportedStreams += 1;
      continue;
    }

    if (kind === 'raw') rawStreams += 1;
    else flateStreams += 1;

    if (isImage) continue;
    analyzedStreams += 1;
    if (hasTextShowingOperator(decoded.toString('latin1'))) detected = true;
  }

  let textLayerState: PdfTextLayerState = 'unknown';
  if (!encrypted && detected) textLayerState = 'detected';
  else if (!encrypted && analyzedStreams > 0 && unsupportedStreams === 0 && !limited) textLayerState = 'not_detected';

  return {
    version: 1,
    parser: 'pdf-structure-v1',
    encrypted,
    textLayerState,
    analyzedStreams,
    rawStreams,
    flateStreams,
    imageStreams,
    unsupportedStreams,
    limited,
  };
}
