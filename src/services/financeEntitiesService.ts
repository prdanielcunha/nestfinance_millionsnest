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
    if (res.status === 404 && errorData.reason === 'NOT_FOUND') {
      throw new Error('REGISTRY_NOT_FOUND');
    }
    if (res.status === 503 && errorData.reason === 'PROVIDER_UNAVAILABLE') {
       throw new Error('PROVIDER_UNAVAILABLE');
    }
    if (res.status === 400 && errorData.error === 'INVALID_TAX_ID') {
       throw new Error('INVALID_TAX_ID');
    }
    if (res.status === 400 && errorData.error === 'REGISTRY_AUTOMATIC_LOOKUP_UNSUPPORTED') {
       throw new Error('REGISTRY_AUTOMATIC_LOOKUP_UNSUPPORTED');
    }
    throw new Error(errorData.error || 'Não foi possível consultar o CNPJ.');
  }

  const data = await res.json();
  
  if (!data || data.found !== true || !data.entity) {
      throw new Error('INVALID_RESPONSE');
  }

  const entity = data.entity;
  if (!entity.legalName || typeof entity.legalName !== 'string' || entity.legalName.trim().length === 0) {
      throw new Error('INVALID_RESPONSE');
  }

  const formatAddressStr = (val: any) => (typeof val === 'string' && val.trim() ? val.trim() : null);

  const parsedResponse = {
      found: true,
      provider: data.provider,
      providerDataset: data.providerDataset,
      queriedAt: data.queriedAt,
      entity: {
          taxId: entity.taxId,
          taxIdFormatted: entity.taxIdFormatted,
          legalName: entity.legalName.trim(),
          tradeName: formatAddressStr(entity.tradeName),
          registrationStatus: formatAddressStr(entity.registrationStatus),
          registrationStatusDate: formatAddressStr(entity.registrationStatusDate),
          openingDate: formatAddressStr(entity.openingDate),
          legalNatureCode: formatAddressStr(entity.legalNatureCode),
          legalNatureDescription: formatAddressStr(entity.legalNatureDescription),
          primaryActivityCode: formatAddressStr(entity.primaryActivityCode),
          primaryActivityDescription: formatAddressStr(entity.primaryActivityDescription),
          registeredAddress: typeof entity.registeredAddress === 'object' && entity.registeredAddress ? {
              postalCode: formatAddressStr(entity.registeredAddress.postalCode),
              street: formatAddressStr(entity.registeredAddress.street),
              number: formatAddressStr(entity.registeredAddress.number),
              complement: formatAddressStr(entity.registeredAddress.complement),
              neighborhood: formatAddressStr(entity.registeredAddress.neighborhood),
              city: formatAddressStr(entity.registeredAddress.city),
              state: formatAddressStr(entity.registeredAddress.state)
          } : {
              postalCode: null, street: null, number: null, complement: null, neighborhood: null, city: null, state: null
          }
      }
  };

  return parsedResponse;
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

export async function getFinanceEntityDetail(financeEntityId: string): Promise<any> {
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error('Não autenticado');
  
    const token = await user.getIdToken();
  
    const res = await fetch('/api/finance/entities/detail', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ financeEntityId }),
      cache: 'no-store'
    });
  
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      if (res.status === 404 && errorData.error === 'FINANCE_ENTITY_NOT_FOUND') {
         throw new Error('FINANCE_ENTITY_NOT_FOUND');
      }
      throw new Error(errorData.error || 'Não foi possível carregar os detalhes da igreja.');
    }
  
    return res.json();
}

export async function updateFinanceEntity(payload: any): Promise<any> {
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error('Não autenticado');
  
    const token = await user.getIdToken();
  
    const res = await fetch('/api/finance/entities/update', {
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
      if (res.status === 404 && errorData.error === 'NOT_FOUND') {
        throw new Error('NOT_FOUND');
      }
      throw new Error(errorData.error || 'Não foi possível atualizar a igreja.');
    }
  
    return res.json();
}
