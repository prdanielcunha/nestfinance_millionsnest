import { firebaseAuth } from '@/src/lib/firebase';

export async function archiveAccount(accountId: string): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Não autenticado');

  const token = await user.getIdToken();

  const res = await fetch('/api/finance/accounts/archive', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ accountId }),
    cache: 'no-store'
  });

  if (!res.ok) {
    if (res.status === 503) {
      throw new Error('A funcionalidade está temporariamente indisponível.');
    }
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Não foi possível arquivar a conta.');
  }
}

export async function reactivateAccount(accountId: string): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Não autenticado');

  const token = await user.getIdToken();

  const res = await fetch('/api/finance/accounts/reactivate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ accountId }),
    cache: 'no-store'
  });

  if (!res.ok) {
    if (res.status === 503) {
      throw new Error('A funcionalidade está temporariamente indisponível.');
    }
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Não foi possível reativar a conta.');
  }
}
