import { firebaseAuth } from '@/src/lib/firebase';

export async function archiveCategory(categoryId: string): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Não autenticado');

  const token = await user.getIdToken();

  const res = await fetch('/api/finance/categories/archive', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ categoryId }),
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

export async function reactivateCategory(categoryId: string): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Não autenticado');

  const token = await user.getIdToken();

  const res = await fetch('/api/finance/categories/reactivate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ categoryId }),
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
