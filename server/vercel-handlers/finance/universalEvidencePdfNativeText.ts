import { getDocumentProxy } from 'unpdf';

export const UNIVERSAL_EVIDENCE_NATIVE_TEXT_MAX_BYTES = 4 * 1024 * 1024;
export const UNIVERSAL_EVIDENCE_NATIVE_TEXT_MAX_PAGES = 50;
export const UNIVERSAL_EVIDENCE_NATIVE_TEXT_MAX_CHARS = 100_000;

type NativeTextLimits = {
  maxPages?: number;
  maxChars?: number;
};

export type NativePdfTextExtraction = {
  version: 1;
  parser: 'pdfjs-native-text-v1';
  totalPages: number;
  processedPages: number;
  pagesWithText: number;
  charCount: number;
  truncated: boolean;
  truncationReason: 'page_limit' | 'character_limit' | null;
  text: string;
};

function positiveSafeInteger(value: number | undefined, fallback: number) {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function normalizeMergedText(value: string) {
  return value
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractNativePdfText(
  bytes: Buffer,
  limits: NativeTextLimits = {},
): Promise<NativePdfTextExtraction> {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    throw new Error('EVIDENCE_NATIVE_TEXT_INVALID_INPUT');
  }
  if (bytes.length > UNIVERSAL_EVIDENCE_NATIVE_TEXT_MAX_BYTES) {
    throw new Error('EVIDENCE_NATIVE_TEXT_TOO_LARGE');
  }

  const maxPages = positiveSafeInteger(limits.maxPages, UNIVERSAL_EVIDENCE_NATIVE_TEXT_MAX_PAGES);
  const maxChars = positiveSafeInteger(limits.maxChars, UNIVERSAL_EVIDENCE_NATIVE_TEXT_MAX_CHARS);
  const data = Uint8Array.from(bytes);
  const pdf = await getDocumentProxy(data, {
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    maxImageSize: 1,
  });

  try {
    const totalPages = Number(pdf.numPages);
    if (!Number.isSafeInteger(totalPages) || totalPages < 1) {
      throw new Error('EVIDENCE_NATIVE_TEXT_INVALID_PDF');
    }

    const pagesToProcess = Math.min(totalPages, maxPages);
    let processedPages = 0;
    let pagesWithText = 0;
    let remainingChars = maxChars;
    let characterLimited = false;
    const chunks: string[] = [];

    for (let pageNumber = 1; pageNumber <= pagesToProcess; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        let pageHadText = false;

        for (const item of content.items as Array<{ str?: unknown; hasEOL?: unknown }>) {
          if (typeof item?.str !== 'string' || item.str.length === 0) continue;
          pageHadText = true;

          const suffix = item.hasEOL === true ? '\n' : '';
          const fragment = `${item.str}${suffix}`;
          if (fragment.length <= remainingChars) {
            chunks.push(fragment);
            remainingChars -= fragment.length;
          } else {
            if (remainingChars > 0) chunks.push(fragment.slice(0, remainingChars));
            remainingChars = 0;
            characterLimited = true;
            break;
          }
        }

        processedPages += 1;
        if (pageHadText) pagesWithText += 1;
      } finally {
        page.cleanup();
      }

      if (characterLimited || remainingChars === 0) {
        characterLimited = true;
        break;
      }
      if (pageNumber < pagesToProcess) {
        chunks.push('\n');
        remainingChars -= 1;
      }
    }

    const pageLimited = totalPages > maxPages && !characterLimited;
    const text = normalizeMergedText(chunks.join(''));
    const truncationReason = characterLimited
      ? 'character_limit'
      : pageLimited
        ? 'page_limit'
        : null;

    return {
      version: 1,
      parser: 'pdfjs-native-text-v1',
      totalPages,
      processedPages,
      pagesWithText,
      charCount: text.length,
      truncated: truncationReason !== null,
      truncationReason,
      text,
    };
  } finally {
    await pdf.destroy();
  }
}
