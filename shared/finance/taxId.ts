export function normalizeCnpj(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.toUpperCase().replace(/[^\w\d]/g, '').trim();
}

export function formatCnpj(value: string): string {
  const c = normalizeCnpj(value);
  if (c.length !== 14) {
    return value;
  }
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12, 14)}`;
}

export function isValidCnpj(value: unknown): boolean {
  const c = normalizeCnpj(value);
  if (c.length !== 14) {
    return false;
  }
  
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(c)) {
    return false;
  }
  
  const isNumericOnly = /^[0-9]{14}$/.test(c);
  if (isNumericOnly) {
    // Check for common numeric invalid patterns (all same numbers)
    if (/^([0-9])\1{13}$/.test(c)) {
      return false;
    }
  }

  // Calculate DV
  const calculateDV = (cnpjStr: string, position: 1 | 2) => {
    let sum = 0;
    const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const weights = position === 1 ? weights1 : weights2;
    
    for (let i = 0; i < weights.length; i++) {
      const charCode = cnpjStr.charCodeAt(i);
      const val = charCode - 48; // ASCII - 48
      sum += val * weights[i];
    }
    
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const dv1 = calculateDV(c, 1);
  if (parseInt(c.charAt(12), 10) !== dv1) {
    return false;
  }
  
  const dv2 = calculateDV(c, 2);
  if (parseInt(c.charAt(13), 10) !== dv2) {
    return false;
  }

  return true;
}

export function getCnpjFormat(value: string): 'numeric' | 'alphanumeric' {
  const c = normalizeCnpj(value);
  if (/^[0-9]{14}$/.test(c)) {
    return 'numeric';
  }
  return 'alphanumeric';
}
