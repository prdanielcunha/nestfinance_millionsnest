import { firebaseAuth } from '@/src/lib/firebase';

export async function lookupCnpj(taxId: string): Promise<any> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Não autenticado');

  const token = await user.getIdToken();

  const res = await fetch('/api/finance/entities/cnpj-lookup', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ taxId }),
    cache: 'no-store'
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    if (res.status === 404 && errorData.error === 'REGISTRY_NOT_FOUND') {
      throw new Error('REGISTRY_NOT_FOUND');
    }
    if (res.status === 404 && errorData.error === 'REGISTRY_PROVIDER_UNAVAILABLE') {
       throw new Error('REGISTRY_PROVIDER_UNAVAILABLE');
    }
     if (res.status === 404 && errorData.error === 'REGISTRY_PROVIDER_TIMEOUT') {
       throw new Error('REGISTRY_PROVIDER_TIMEOUT');
    }
    if (res.status === 400 && errorData.error === 'INVALID_TAX_ID') {
       throw new Error('INVALID_TAX_ID');
    }
    if (res.status === 400 && errorData.error === 'REGISTRY_AUTOMATIC_LOOKUP_UNSUPPORTED') {
       throw new Error('REGISTRY_AUTOMATIC_LOOKUP_UNSUPPORTED');
    }
    throw new Error(errorData.error || 'Não foi possível consultar o CNPJ.');
  }

  return res.json();
}

export async function createFinanceEntity(payload: any): Promise<any> {
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error('Não autenticado');
  
    const token = await user.getIdToken();
  
    const res = await fetch('/api/finance/entities/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store'
    });
  
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      if (res.status === 409 && errorData.error === 'FINANCE_ENTITY_ALREADY_EXISTS') {
        throw new Error('FINANCE_ENTITY_ALREADY_EXISTS');
      }
      if (res.status === 503 && errorData.error === 'ENTITIES_WRITE_DISABLED') {
         throw new Error('ENTITIES_WRITE_DISABLED');
      }
      throw new Error(errorData.error || 'Não foi possível criar a entidade.');
    }
  
    return res.json();
}

export async function listFinanceEntities(): Promise<any> {
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error('Não autenticado');
  
    const token = await user.getIdToken();
  
    const res = await fetch('/api/finance/entities/list', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store'
    });
  
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Não foi possível carregar as igrejas.');
    }
  
    return res.json();
}
