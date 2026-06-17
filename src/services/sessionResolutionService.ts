import { EcosystemAccessState } from '../types/access';
import { firebaseAuth } from '../lib/firebase';

export async function resolveEcosystemSession(): Promise<EcosystemAccessState> {
  const currentUser = firebaseAuth.currentUser;
  
  if (!currentUser) {
    return { status: 'unauthenticated' };
  }

  try {
    const idToken = await currentUser.getIdToken();
    
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
      return { status: 'unauthenticated' };
    }

    if (response.status === 403) {
      return { status: 'denied' };
    }

    if (response.status === 503) {
      return { status: 'unavailable' };
    }

    if (!response.ok) {
      return { status: 'error' };
    }

    const data = await response.json();

    if (
      data?.status === 'granted' &&
      typeof data.organizationId === 'string' &&
      typeof data.isGlobalAccess === 'boolean' &&
      (data.accessSource === 'global_system_role' || data.accessSource === 'organization_membership')
    ) {
      return {
        status: 'granted',
        organizationId: data.organizationId,
        isGlobalAccess: data.isGlobalAccess,
        accessSource: data.accessSource,
        organization: data.organization,
        profile: data.profile,
        financeSetup: data.financeSetup,
      };
    }

    return { status: 'error' };
  } catch (error) {
    return { status: 'error' };
  }
}
