import { FieldValue, Timestamp, DocumentReference, GeoPoint } from 'firebase-admin/firestore';

/**
 * Sanitizes an object for Firestore storage by removing all 'undefined' properties recursively.
 * It preserves string values, safe integers, null (when allowed by contract), and does not invent defaults.
 */
export function sanitizeFirestoreObject<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Preserve Date
  if (obj instanceof Date) {
    if (isNaN(obj.getTime())) {
      throw { code: 'FINANCE_INVALID_DATE', message: 'Invalid Date object' };
    }
    return obj;
  }

  // Preserve Firestore Special Types (official instanceof check)
  if (
    obj instanceof FieldValue ||
    obj instanceof Timestamp ||
    obj instanceof DocumentReference ||
    obj instanceof GeoPoint
  ) {
    return obj;
  }

  // Preserve Binary / Bytes
  if (obj instanceof Buffer || obj instanceof Uint8Array) {
    return obj;
  }

  // Structural/Name fallback check for Firestore types in different or mocked environments
  const constructorName = obj.constructor?.name;
  if (
    constructorName === 'FieldValue' ||
    constructorName === 'Timestamp' ||
    constructorName === 'DocumentReference' ||
    constructorName === 'GeoPoint' ||
    constructorName === 'Sentinel' ||
    constructorName === 'FakeDoc' ||
    constructorName === 'FakeQuery' ||
    (typeof (obj as any).isEqual === 'function' && (constructorName === 'FieldValue' || constructorName === 'DocumentReference' || constructorName === 'FakeDoc'))
  ) {
    return obj;
  }

  // Handle Arrays
  if (Array.isArray(obj)) {
    // Array Rules:
    // - Preservar ordem e quantidade.
    // - Rejeitar undefined em arrays financeiros / esparsos.
    for (let i = 0; i < obj.length; i++) {
      if (!(i in obj)) {
        throw { code: 'FINANCE_ARRAY_SPARSE_REJECTED', message: 'Sparse array is not allowed' };
      }
      if (obj[i] === undefined) {
        throw { code: 'FINANCE_ARRAY_UNDEFINED_REJECTED', message: 'Array with undefined elements is not allowed' };
      }
    }
    return obj.map(item => sanitizeFirestoreObject(item)) as any;
  }

  // Reject unknown classes to prevent unintended transformations
  const proto = Object.getPrototypeOf(obj);
  const isPlain = proto === null || proto === Object.prototype;

  if (!isPlain) {
    throw {
      code: 'FINANCE_UNKNOWN_CLASS_INSTANCE',
      message: `Unknown class instance: ${constructorName || 'unknown'}`
    };
  }

  // Plain Object Rules:
  // - Remover apenas propriedades opcionais com valor undefined.
  // - Sanitizar recursivamente propriedades próprias.
  // - Preservar chaves válidas.
  // - Não alterar protótipo.
  // - Não aceitar prototype pollution.
  const result: any = {};
  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    const val = (obj as any)[key];
    if (val === undefined) {
      continue;
    }
    if (val === null) {
      result[key] = null;
    } else {
      result[key] = sanitizeFirestoreObject(val);
    }
  }

  return result;
}
