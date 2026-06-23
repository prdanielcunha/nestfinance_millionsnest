/**
 * Sanitizes an object for Firestore storage by removing all 'undefined' properties recursively.
 * It preserves string values, safe integers, null (when allowed by contract), and does not invent defaults.
 */
export function sanitizeFirestoreObject<T extends Record<string, any>>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => (typeof item === 'object' && item !== null) ? sanitizeFirestoreObject(item) : item) as any;
  }

  const result: any = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val === undefined) {
      continue;
    }
    if (val === null) {
      result[key] = null;
    } else if (typeof val === 'object') {
      result[key] = sanitizeFirestoreObject(val);
    } else {
      result[key] = val;
    }
  }
  return result;
}
