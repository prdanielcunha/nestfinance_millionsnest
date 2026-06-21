import { firebaseAuth } from '@/src/lib/firebase';

export async function archiveCategory(categoryId: string, financeEntityId: string): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Não autenticado');

  if (!financeEntityId) throw new Error('FinanceEntityId is required');

  const token = await user.getIdToken();

  const res = await fetch('/api/finance/categories/archive', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ categoryId, financeEntityId }),
    cache: 'no-store'
  });

  if (!res.ok) {
    if (res.status === 503) {
      throw new Error('A funcionalidade está temporariamente indisponível.');
    }
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Não foi possível arquivar a categoria.');
  }
}

export async function reactivateCategory(categoryId: string, financeEntityId: string): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Não autenticado');

  if (!financeEntityId) throw new Error('FinanceEntityId is required');

  const token = await user.getIdToken();

  const res = await fetch('/api/finance/categories/reactivate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ categoryId, financeEntityId }),
    cache: 'no-store'
  });

  if (!res.ok) {
    if (res.status === 503) {
      throw new Error('A funcionalidade está temporariamente indisponível.');
    }
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Não foi possível reativar a categoria.');
  }
}

export async function updateCategory(params: { categoryId: string, name: string, accountingCode: string | null, financeEntityId: string }): Promise<any> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Não autenticado');

  if (!params.financeEntityId) throw new Error('FinanceEntityId is required');

  const token = await user.getIdToken();

  const res = await fetch('/api/finance/categories/update', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
    cache: 'no-store'
  });

  if (!res.ok) {
    if (res.status === 503) {
      throw new Error('A funcionalidade está temporariamente indisponível.');
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 409) {
      if (data.error === 'CATEGORY_ALREADY_EXISTS') {
        throw new Error('Já existe uma categoria com esse nome neste tipo.');
      }
    }
    throw new Error(data.error || 'Não foi possível atualizar a categoria.');
  }
  
  return res.json();
}
