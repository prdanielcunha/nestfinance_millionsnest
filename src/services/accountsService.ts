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

export async function updateAccount(data: {
  accountId: string;
  name: string;
  institutionName: string | null;
  accountLast4: string | null;
}): Promise<any> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Não autenticado');

  const token = await user.getIdToken();

  const res = await fetch('/api/finance/accounts/update', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
    cache: 'no-store'
  });

  if (!res.ok) {
    if (res.status === 409) {
      throw new Error('Já existe uma conta com esse nome.');
    }
    if (res.status === 503) {
      throw new Error('A funcionalidade está temporariamente indisponível.');
    }
    const respData = await res.json().catch(() => ({}));
    throw new Error(respData.error || 'Não foi possível atualizar a conta. Tente novamente.');
  }

  return res.json();
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
