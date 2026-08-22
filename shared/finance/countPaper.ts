export const COUNT_PAPER_TEMPLATE_VERSION = 1 as const;
export const COUNT_PAPER_STAGES = ['count_a', 'count_b'] as const;
export const COUNT_PAPER_LOCALES = ['PT', 'EN', 'ES'] as const;
export const COUNT_PAPER_QR_VERSION = 6 as const;
export const COUNT_PAPER_QR_SIZE = 41 as const;
export const COUNT_PAPER_QR_MAX_BYTES = 106 as const;

export type CountPaperStage = (typeof COUNT_PAPER_STAGES)[number];
export type CountPaperLocale = (typeof COUNT_PAPER_LOCALES)[number];

export type CountPaperIdentity = {
  formId: string;
  templateVersion: number;
  checksum: string;
};

export type CountPaperFormDetail = CountPaperIdentity & {
  countSessionId: string;
  serviceLabel: string;
  serviceDate: string;
  stage: CountPaperStage;
  locale: CountPaperLocale;
  qrPayload: string;
  createdAt?: string | null;
};

export function isCountPaperStage(value: unknown): value is CountPaperStage {
  return typeof value === 'string' && COUNT_PAPER_STAGES.includes(value as CountPaperStage);
}

export function isCountPaperLocale(value: unknown): value is CountPaperLocale {
  return typeof value === 'string' && COUNT_PAPER_LOCALES.includes(value as CountPaperLocale);
}

export function isValidCountPaperFormId(value: unknown): value is string {
  return typeof value === 'string' && /^cpf_[a-f0-9]{16}$/.test(value);
}

export function isValidCountPaperChecksum(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
}

export function buildCountPaperQrPayload(identity: CountPaperIdentity): string {
  if (!isValidCountPaperFormId(identity.formId)) throw new Error('COUNT_PAPER_INVALID_FORM_ID');
  if (identity.templateVersion !== COUNT_PAPER_TEMPLATE_VERSION) throw new Error('COUNT_PAPER_INVALID_TEMPLATE_VERSION');
  if (!isValidCountPaperChecksum(identity.checksum)) throw new Error('COUNT_PAPER_INVALID_CHECKSUM');

  const payload = JSON.stringify({
    formId: identity.formId,
    templateVersion: identity.templateVersion,
    checksum: identity.checksum,
  });

  if (payload.length > COUNT_PAPER_QR_MAX_BYTES || /[^\x20-\x7E]/.test(payload)) {
    throw new Error('COUNT_PAPER_QR_PAYLOAD_TOO_LARGE');
  }
  return payload;
}

function gfTables() {
  const exp = new Array<number>(512).fill(0);
  const log = new Array<number>(256).fill(0);
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    exp[index] = value;
    log[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let index = 255; index < 512; index += 1) exp[index] = exp[index - 255];
  return { exp, log };
}

const GF = gfTables();

function gfMultiply(left: number, right: number) {
  if (left === 0 || right === 0) return 0;
  return GF.exp[GF.log[left] + GF.log[right]];
}

function polynomialMultiply(left: number[], right: number[]) {
  const output = new Array<number>(left.length + right.length - 1).fill(0);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      output[leftIndex + rightIndex] ^= gfMultiply(left[leftIndex], right[rightIndex]);
    }
  }
  return output;
}

function reedSolomonGenerator(degree: number) {
  let generator = [1];
  for (let index = 0; index < degree; index += 1) {
    generator = polynomialMultiply(generator, [1, GF.exp[index]]);
  }
  return generator;
}

function reedSolomonRemainder(data: number[], degree: number) {
  const generator = reedSolomonGenerator(degree);
  const remainder = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    for (let index = 0; index < degree; index += 1) {
      remainder[index] ^= gfMultiply(generator[index + 1], factor);
    }
  }
  return remainder;
}

function appendBits(target: number[], value: number, length: number) {
  for (let bit = length - 1; bit >= 0; bit -= 1) target.push((value >>> bit) & 1);
}

function createVersion6MCodewords(payload: string) {
  const bytes = [...payload].map((character) => character.charCodeAt(0));
  if (bytes.length > COUNT_PAPER_QR_MAX_BYTES || bytes.some((byte) => byte > 0x7f)) {
    throw new Error('COUNT_PAPER_QR_PAYLOAD_TOO_LARGE');
  }

  const dataCapacityBytes = 108;
  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  for (const byte of bytes) appendBits(bits, byte, 8);

  const capacityBits = dataCapacityBytes * 8;
  for (let index = 0; index < Math.min(4, capacityBits - bits.length); index += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataCodewords: number[] = [];
  for (let offset = 0; offset < bits.length; offset += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) byte = (byte << 1) | bits[offset + bit];
    dataCodewords.push(byte);
  }

  let padIndex = 0;
  while (dataCodewords.length < dataCapacityBytes) {
    dataCodewords.push(padIndex % 2 === 0 ? 0xec : 0x11);
    padIndex += 1;
  }

  // QR Version 6 / Error Correction M: four equal RS blocks,
  // each with 27 data codewords and 16 error-correction codewords.
  const blocks = Array.from({ length: 4 }, (_, index) => dataCodewords.slice(index * 27, (index + 1) * 27));
  const eccBlocks = blocks.map((block) => reedSolomonRemainder(block, 16));
  const interleaved: number[] = [];
  for (let index = 0; index < 27; index += 1) {
    for (const block of blocks) interleaved.push(block[index]);
  }
  for (let index = 0; index < 16; index += 1) {
    for (const block of eccBlocks) interleaved.push(block[index]);
  }
  return interleaved;
}

function formatBitsForMediumMaskZero() {
  const data = 0;
  let remainder = data;
  for (let index = 0; index < 10; index += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) * 0x537);
  }
  return ((data << 10) | remainder) ^ 0x5412;
}

export function createCountPaperQrMatrix(payload: string): boolean[][] {
  const codewords = createVersion6MCodewords(payload);
  const size = COUNT_PAPER_QR_SIZE;
  const matrix = Array.from({ length: size }, () => new Array<boolean | null>(size).fill(null));

  const setFunction = (row: number, column: number, value: boolean) => {
    if (row < 0 || row >= size || column < 0 || column >= size) return;
    matrix[row][column] = value;
  };

  const drawFinder = (centerRow: number, centerColumn: number) => {
    for (let rowOffset = -4; rowOffset <= 4; rowOffset += 1) {
      for (let columnOffset = -4; columnOffset <= 4; columnOffset += 1) {
        const distance = Math.max(Math.abs(rowOffset), Math.abs(columnOffset));
        setFunction(centerRow + rowOffset, centerColumn + columnOffset, distance !== 2 && distance !== 4);
      }
    }
  };

  for (let index = 0; index < size; index += 1) {
    if (matrix[6][index] === null) setFunction(6, index, index % 2 === 0);
    if (matrix[index][6] === null) setFunction(index, 6, index % 2 === 0);
  }

  drawFinder(3, 3);
  drawFinder(3, size - 4);
  drawFinder(size - 4, 3);

  // Version 6 has one non-overlapping alignment pattern at (34, 34).
  for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
    for (let columnOffset = -2; columnOffset <= 2; columnOffset += 1) {
      const distance = Math.max(Math.abs(rowOffset), Math.abs(columnOffset));
      setFunction(34 + rowOffset, 34 + columnOffset, distance !== 1);
    }
  }

  const formatBits = formatBitsForMediumMaskZero();
  const formatBit = (index: number) => ((formatBits >>> index) & 1) !== 0;
  for (let index = 0; index < 6; index += 1) setFunction(index, 8, formatBit(index));
  setFunction(7, 8, formatBit(6));
  setFunction(8, 8, formatBit(7));
  setFunction(8, 7, formatBit(8));
  for (let index = 9; index < 15; index += 1) setFunction(8, 14 - index, formatBit(index));
  for (let index = 0; index < 8; index += 1) setFunction(8, size - 1 - index, formatBit(index));
  for (let index = 8; index < 15; index += 1) setFunction(size - 15 + index, 8, formatBit(index));
  setFunction(size - 8, 8, true);

  const dataBits: number[] = [];
  for (const codeword of codewords) appendBits(dataBits, codeword, 8);
  let dataIndex = 0;
  let upward = true;

  for (let rightColumn = size - 1; rightColumn >= 1; rightColumn -= 2) {
    if (rightColumn === 6) rightColumn -= 1;
    for (let offset = 0; offset < size; offset += 1) {
      const row = upward ? size - 1 - offset : offset;
      for (const column of [rightColumn, rightColumn - 1]) {
        if (matrix[row][column] !== null) continue;
        let bit = dataIndex < dataBits.length ? dataBits[dataIndex] : 0;
        dataIndex += 1;
        if ((row + column) % 2 === 0) bit ^= 1;
        matrix[row][column] = bit === 1;
      }
    }
    upward = !upward;
  }

  return matrix.map((row) => row.map((value) => Boolean(value)));
}
