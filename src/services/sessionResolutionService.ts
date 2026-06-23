import { EcosystemAccessState } from '../types/access';
import { firebaseAuth } from '../lib/firebase';

let cachedSessionPromise: Promise<EcosystemAccessState> | null = null;
let cachedSessionToken: string | null = null;
let cachedSessionResult: EcosystemAccessState | null = null;

export function getCachedSessionResult(): EcosystemAccessState | null {
  return cachedSessionResult;
}

export async function resolveEcosystemSession(forceRefresh = false): Promise<EcosystemAccessState> {
  const currentUser = firebaseAuth.currentUser;
  
  if (!currentUser) {
    cachedSessionPromise = null;
    cachedSessionToken = null;
    cachedSessionResult = null;
    return { status: 'unauthenticated' };
  }

  try {
    const idToken = await currentUser.getIdToken();
    
    if (!forceRefresh && cachedSessionPromise && cachedSessionToken === idToken) {
       return await cachedSessionPromise;
    }

    cachedSessionToken = idToken;
    cachedSessionPromise = (async () => {
      const response = await fetch('/api/auth/session/resolve', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Accept': 'application/json',
        },
        cache: 'no-store',
      });

      if (response.status === 401) {
        await firebaseAuth.signOut();
        cachedSessionResult = { status: 'unauthenticated' };
        return cachedSessionResult;
      }

      if (response.status === 403) {
        cachedSessionResult = { status: 'denied' };
        return cachedSessionResult;
      }

      if (response.status === 503) {
        cachedSessionResult = { status: 'unavailable' };
        return cachedSessionResult;
      }

      if (!response.ok) {
        cachedSessionResult = { status: 'error' };
        return cachedSessionResult;
      }

      const data = await response.json();

      if (
        data?.status === 'granted' &&
        typeof data.organizationId === 'string' &&
        typeof data.isGlobalAccess === 'boolean' &&
        (data.accessSource === 'global_system_role' || data.accessSource === 'global_role' || data.accessSource === 'organization_membership') &&
        typeof data.organization === 'object' && data.organization !== null &&
        typeof data.profile === 'object' && data.profile !== null &&
        typeof data.financeSetup === 'object' && data.financeSetup !== null
      ) {
        cachedSessionResult = {
          status: 'granted',
          organizationId: data.organizationId,
          isGlobalAccess: data.isGlobalAccess,
          accessSource: data.accessSource,
          capabilities: Array.isArray(data.capabilities) ? data.capabilities : [],
          organization: {
            id: data.organization.id,
            name: data.organization.name,
            slug: data.organization.slug,
            logoPath: data.organization.logoPath,
          },
          profile: {
            displayName: data.profile.displayName,
            photoURL: data.profile.photoURL,
          },
          financeSetup: {
            status: (data.financeSetup.status === 'ready' || data.financeSetup.status === 'configured')
              ? 'configured'
              : 'not_configured',
          },
        };
        return cachedSessionResult;
      }

      cachedSessionResult = { status: 'error' };
      return cachedSessionResult;
    })();

    return await cachedSessionPromise;
  } catch (err) {
    console.error('Falha ao resolver sessão do ecossistema:', err);
    cachedSessionResult = { status: 'error' };
    return cachedSessionResult;
  }
}
