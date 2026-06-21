import { firebaseAuth } from '@/src/lib/firebase';

function mapFinanceError(data: any, defaultMsg: string): string {
  const errorCode = data.error || data.message;
  switch (errorCode) {
    case 'ACCOUNT_NOT_FOUND':
      return 'Não encontramos esta conta nesta igreja. Nada foi alterado.';
    case 'FINANCE_ENTITY_MISMATCH':
      return 'Esta conta pertence a outra igreja. A operação foi bloqueada por segurança.';
    case 'INTERNAL_SERVER_ERROR':
      return 'Ocorreu um erro interno no servidor. Tente novamente mais tarde.';
    case 'ACCOUNT_ALREADY_EXISTS':
      return 'Já existe uma conta com esse nome.';
    default:
      return defaultMsg;
  }
}

export async function archiveAccount(accountId: string, financeEntityId: string): Promise<{changed: boolean}> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Não autenticado');

  if (!financeEntityId) throw new Error('Organization entity not found');

  const token = await user.getIdToken();

  const res = await fetch('/api/finance/accounts/archive', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ accountId, financeEntityId }),
    cache: 'no-store'
  });

  const data = await res.json().catch(() => ({}));
  
  if (!res.ok) {
    if (res.status === 503) {
      throw new Error('A funcionalidade está temporariamente indisponível.');
    }
    throw new Error(mapFinanceError(data, 'Não foi possível arquivar a conta.'));
  }
  
  return { changed: data.changed };
}

export async function updateAccount(data: {
  accountId: string;
  name: string;
  institutionName: string | null;
  accountLast4: string | null;
  financeEntityId: string;
}): Promise<any> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Não autenticado');

  if (!data.financeEntityId) throw new Error('Organization entity not found');

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

  const respData = await res.json().catch(() => ({}));
  
  if (!res.ok) {
    if (res.status === 503) {
      throw new Error('A funcionalidade está temporariamente indisponível.');
    }
    throw new Error(mapFinanceError(respData, 'Não foi possível atualizar a conta. Tente novamente.'));
  }

  return respData;
}

export async function reactivateAccount(accountId: string, financeEntityId: string): Promise<{changed: boolean}> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Não autenticado');

  if (!financeEntityId) throw new Error('Organization entity not found');

  const token = await user.getIdToken();

  const res = await fetch('/api/finance/accounts/reactivate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ accountId, financeEntityId }),
    cache: 'no-store'
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 503) {
      throw new Error('A funcionalidade está temporariamente indisponível.');
    }
    throw new Error(mapFinanceError(data, 'Não foi possível reativar a conta.'));
  }
  
  return { changed: data.changed };
}
