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

type TextOperatorScan = 'detected' | 'not_detected' | 'unknown';

function isWhitespaceCode(code: number | undefined) {
  return code === 0 || code === 9 || code === 10 || code === 12 || code === 13 || code === 32;
}

function isDelimiterCode(code: number | undefined) {
  return code === 40 || code === 41 || code === 60 || code === 62 || code === 91 || code === 93 || code === 47 || code === 37;
}

function hasPdfHeader(bytes: Buffer) {
  return bytes.length >= PDF_HEADER.length && bytes.subarray(0, PDF_HEADER.length).equals(PDF_HEADER);
}

function skipLiteralString(value: string, start: number) {
  let depth = 1;
  let cursor = start + 1;
  while (cursor < value.length) {
    const code = value.charCodeAt(cursor);
    if (code === 92) {
      cursor += 2;
      continue;
    }
    if (code === 40) depth += 1;
    else if (code === 41) {
      depth -= 1;
      if (depth === 0) return cursor + 1;
    }
    cursor += 1;
  }
  return -1;
}

function skipHexString(value: string, start: number) {
  const end = value.indexOf('>', start + 1);
  return end < 0 ? -1 : end + 1;
}

function skipComment(value: string, start: number) {
  let cursor = start + 1;
  while (cursor < value.length) {
    const code = value.charCodeAt(cursor);
    if (code === 10 || code === 13) break;
    cursor += 1;
  }
  return cursor;
}

function findNextKeywordOutsideLexicalNoise(value: string, keyword: string, start: number) {
  let cursor = start;
  while (cursor < value.length) {
    const code = value.charCodeAt(cursor);
    if (isWhitespaceCode(code)) {
      cursor += 1;
      continue;
    }
    if (code === 37) {
      cursor = skipComment(value, cursor);
      continue;
    }
    if (code === 40) {
      const next = skipLiteralString(value, cursor);
      if (next < 0) return -2;
      cursor = next;
      continue;
    }
    if (code === 60) {
      if (value.charCodeAt(cursor + 1) === 60) {
        cursor += 2;
        continue;
      }
      const next = skipHexString(value, cursor);
      if (next < 0) return -2;
      cursor = next;
      continue;
    }
    if (code === 47) {
      cursor += 1;
      while (cursor < value.length) {
        const nameCode = value.charCodeAt(cursor);
        if (isWhitespaceCode(nameCode) || isDelimiterCode(nameCode)) break;
        cursor += 1;
      }
      continue;
    }
    if (code === 39 || code === 34 || isDelimiterCode(code)) {
      cursor += 1;
      continue;
    }

    const tokenStart = cursor;
    while (cursor < value.length) {
      const tokenCode = value.charCodeAt(cursor);
      if (isWhitespaceCode(tokenCode) || isDelimiterCode(tokenCode) || tokenCode === 39 || tokenCode === 34) break;
      cursor += 1;
    }
    if (cursor === tokenStart) {
      cursor += 1;
      continue;
    }
    if (value.slice(tokenStart, cursor) === keyword) return tokenStart;
  }
  return -1;
}

function scanTextOperators(bytes: Buffer): TextOperatorScan {
  const value = bytes.toString('latin1');
  let cursor = 0;
  let inTextObject = false;
  let textShowingSeen = false;

  while (cursor < value.length) {
    const code = value.charCodeAt(cursor);

    if (isWhitespaceCode(code)) {
      cursor += 1;
      continue;
    }
    if (code === 37) {
      cursor = skipComment(value, cursor);
      continue;
    }
    if (code === 40) {
      const next = skipLiteralString(value, cursor);
      if (next < 0) return 'unknown';
      cursor = next;
      continue;
    }
    if (code === 60) {
      if (value.charCodeAt(cursor + 1) === 60) {
        cursor += 2;
        continue;
      }
      const next = skipHexString(value, cursor);
      if (next < 0) return 'unknown';
      cursor = next;
      continue;
    }
    if (code === 47) {
      cursor += 1;
      while (cursor < value.length) {
        const nameCode = value.charCodeAt(cursor);
        if (isWhitespaceCode(nameCode) || isDelimiterCode(nameCode)) break;
        cursor += 1;
      }
      continue;
    }
    if (code === 39 || code === 34) {
      if (inTextObject) textShowingSeen = true;
      cursor += 1;
      continue;
    }
    if (isDelimiterCode(code)) {
      cursor += 1;
      continue;
    }

    const start = cursor;
    while (cursor < value.length) {
      const tokenCode = value.charCodeAt(cursor);
      if (isWhitespaceCode(tokenCode) || isDelimiterCode(tokenCode) || tokenCode === 39 || tokenCode === 34) break;
      cursor += 1;
    }
    if (cursor === start) {
      cursor += 1;
      continue;
    }

    const token = value.slice(start, cursor);
    if (token === 'BI') return 'unknown';
    if (token === 'BT') {
      if (inTextObject) return 'unknown';
      inTextObject = true;
      textShowingSeen = false;
      continue;
    }
    if (token === 'ET') {
      if (!inTextObject) return 'unknown';
      if (textShowingSeen) return 'detected';
      inTextObject = false;
      textShowingSeen = false;
      continue;
    }
    if (inTextObject && (token === 'Tj' || token === 'TJ')) textShowingSeen = true;
  }

  if (inTextObject) return 'unknown';
  return 'not_detected';
}

function findDictionary(text: string, streamIndex: number) {
  const dictEnd = text.lastIndexOf('>>', streamIndex);
  if (dictEnd < 0 || streamIndex - dictEnd > 256) return null;
  const lowerBound = Math.max(0, dictEnd - MAX_STREAM_DICTIONARY_CHARS);
  const dictStart = text.lastIndexOf('<<', dictEnd);
  if (dictStart < lowerBound) return null;
  return text.slice(dictStart, dictEnd + 2);
}

function directStreamLength(dictionary: string) {
  const match = dictionary.match(/\/Length\s+(\d+)(?=\s|>)(?!\s+\d+\s+R\b)/);
  if (!match) return null;
  const length = Number(match[1]);
  return Number.isSafeInteger(length) && length >= 0 ? length : null;
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
    const streamIndex = findNextKeywordOutsideLexicalNoise(documentText, 'stream', cursor);
    if (streamIndex === -1) break;
    if (streamIndex === -2) {
      unsupportedStreams += 1;
      break;
    }
    cursor = streamIndex + 6;

    streamsSeen += 1;
    if (streamsSeen > MAX_STREAMS) {
      limited = true;
      break;
    }

    const dictionary = findDictionary(documentText, streamIndex);
    if (!dictionary) {
      unsupportedStreams += 1;
      break;
    }

    const declaredLength = directStreamLength(dictionary);
    if (declaredLength === null) {
      unsupportedStreams += 1;
      break;
    }

    let dataStart = streamIndex + 6;
    if (bytes[dataStart] === 13 && bytes[dataStart + 1] === 10) dataStart += 2;
    else if (bytes[dataStart] === 10 || bytes[dataStart] === 13) dataStart += 1;
    else {
      unsupportedStreams += 1;
      break;
    }

    const dataEnd = dataStart + declaredLength;
    if (dataEnd > bytes.length) {
      unsupportedStreams += 1;
      break;
    }

    let endStreamIndex = dataEnd;
    while (endStreamIndex < bytes.length && isWhitespaceCode(bytes[endStreamIndex])) endStreamIndex += 1;
    if (!documentText.startsWith('endstream', endStreamIndex)) {
      unsupportedStreams += 1;
      break;
    }
    const afterEndStream = bytes[endStreamIndex + 9];
    if (afterEndStream !== undefined && !isWhitespaceCode(afterEndStream) && !isDelimiterCode(afterEndStream)) {
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

    const streamBytes = bytes.subarray(dataStart, dataEnd);
    const decoded = decodeStream(streamBytes, kind);
    if (!decoded) {
      if (!isImage) unsupportedStreams += 1;
      continue;
    }

    if (kind === 'raw') rawStreams += 1;
    else flateStreams += 1;

    if (isImage) continue;
    analyzedStreams += 1;
    const scan = scanTextOperators(decoded);
    if (scan === 'detected') detected = true;
    else if (scan === 'unknown') unsupportedStreams += 1;
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
