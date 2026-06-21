import { firebaseAuth } from '@/src/lib/firebase';

export async function archiveFund(fundId: string, financeEntityId: string): Promise<any> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Não autenticado');

  if (!financeEntityId) throw new Error('FinanceEntityId is required');

  const token = await user.getIdToken();

  const res = await fetch('/api/finance/funds/archive', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fundId, financeEntityId }),
    cache: 'no-store'
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Não foi possível arquivar o fundo. Tente novamente.');
  }

  return res.json();
}

export async function reactivateFund(fundId: string, financeEntityId: string): Promise<any> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Não autenticado');

  if (!financeEntityId) throw new Error('FinanceEntityId is required');

  const token = await user.getIdToken();

  const res = await fetch('/api/finance/funds/reactivate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fundId, financeEntityId }),
    cache: 'no-store'
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Não foi possível reativar o fundo. Tente novamente.');
  }

  return res.json();
}
