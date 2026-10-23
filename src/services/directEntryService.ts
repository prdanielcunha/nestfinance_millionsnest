import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithCustomToken,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { firebaseAuth, firebaseConfig } from '../lib/firebase';
import { clearNestFinanceSessionLifecycle, markNestFinanceSessionOrigin } from './ecosystemSessionLifecycle';
import { clearSessionResolutionCache } from './sessionResolutionService';

const DIRECT_APP_NAME = 'nestfinance-direct-entry';
const REDIRECT_PENDING_KEY = 'nf_direct_google_redirect_pending';

const directApp = getApps().some((app) => app.name === DIRECT_APP_NAME)
  ? getApp(DIRECT_APP_NAME)
  : initializeApp(firebaseConfig, DIRECT_APP_NAME);

const directAuth = getAuth(directApp);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export type DirectEntryOrganization = {
  id: string;
  name: string;
  slug?: string;
};

export type DirectEntryResult =
  | { status: 'ready'; organization: DirectEntryOrganization }
  | { status: 'choose_organization'; organizations: DirectEntryOrganization[] }
  | { status: 'no_access' };

async function exchange(
  user: User,
  organizationId?: string,
  source: 'direct_identity' | 'current_session' = 'direct_identity',
): Promise<DirectEntryResult> {
  const idToken = await user.getIdToken(true);
  const response = await fetch('/api/auth/direct-entry', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(organizationId ? { organizationId } : {}),
    cache: 'no-store',
  });

  if (response.status === 403) return { status: 'no_access' };
  if (response.status === 401) {
    if (source === 'direct_identity') {
      await signOut(directAuth).catch(() => undefined);
      throw new Error('DIRECT_IDENTITY_EXPIRED');
    }
    await signOut(firebaseAuth).catch(() => undefined);
    throw new Error('CURRENT_SESSION_EXPIRED');
  }
  if (!response.ok) throw new Error('DIRECT_ENTRY_UNAVAILABLE');

  const data = await response.json();

  if (data?.status === 'choose_organization' && Array.isArray(data.organizations)) {
    return {
      status: 'choose_organization',
      organizations: data.organizations
        .filter((item: any) => item && typeof item.id === 'string' && typeof item.name === 'string')
        .map((item: any) => ({ id: item.id, name: item.name, slug: typeof item.slug === 'string' ? item.slug : undefined })),
    };
  }

  if (
    data?.status === 'ready' &&
    typeof data.customToken === 'string' &&
    data.organization &&
    typeof data.organization.id === 'string' &&
    typeof data.organization.name === 'string'
  ) {
    await signInWithCustomToken(firebaseAuth, data.customToken);
    if (source === 'direct_identity') {
      markNestFinanceSessionOrigin('direct');
      await signOut(directAuth).catch(() => undefined);
    }
    return {
      status: 'ready',
      organization: {
        id: data.organization.id,
        name: data.organization.name,
        slug: typeof data.organization.slug === 'string' ? data.organization.slug : undefined,
      },
    };
  }

  throw new Error('DIRECT_ENTRY_INVALID_RESPONSE');
}

export async function startGoogleDirectEntry(): Promise<DirectEntryResult> {
  // Invoke the popup in the click's user-activation window. getAuth already
  // configures durable browser persistence; awaiting setPersistence here can
  // lose that activation on Safari. Cross-domain redirects cannot recover
  // reliably under Safari's third-party storage restrictions (Firebase option 2).
  const credential = await signInWithPopup(directAuth, googleProvider);
  return exchange(credential.user);
}

let entryRecovery: Promise<DirectEntryResult | null> | null = null;

async function recoverGoogleEntry(): Promise<DirectEntryResult | null> {
  let pending = false;
  try { pending = sessionStorage.getItem(REDIRECT_PENDING_KEY) === '1'; } catch {}
  // Complete any redirect started by an older release, then also recover a
  // persisted identity (e.g. a reload while choosing an organization).
  const result = pending ? await getRedirectResult(directAuth) : null;
  await directAuth.authStateReady();
  await firebaseAuth.authStateReady();
  const directUser = result?.user || directAuth.currentUser;
  try {
    if (directUser) return await exchange(directUser);
    if (firebaseAuth.currentUser) return await resolveCurrentSessionOrganizations();
    if (pending) throw new Error('DIRECT_REDIRECT_INCOMPLETE');
    return null;
  } finally {
    try { sessionStorage.removeItem(REDIRECT_PENDING_KEY); } catch {}
  }
}

export function finishGoogleRedirectEntry(): Promise<DirectEntryResult | null> {
  // React StrictMode mounts effects twice; both subscribers must receive the
  // same completion rather than consume the credential twice.
  if (!entryRecovery) {
    entryRecovery = recoverGoogleEntry().finally(() => { entryRecovery = null; });
  }
  return entryRecovery;
}

export async function chooseDirectEntryOrganization(organizationId: string): Promise<DirectEntryResult> {
  const user = directAuth.currentUser;
  if (!user) return chooseCurrentSessionOrganization(organizationId);
  return exchange(user, organizationId);
}

export async function clearDirectEntryIdentity() {
  await Promise.all([signOut(directAuth), signOut(firebaseAuth)]);
  clearSessionResolutionCache();
  clearNestFinanceSessionLifecycle();
}


export async function resolveCurrentSessionOrganizations(): Promise<DirectEntryResult> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('CURRENT_SESSION_EXPIRED');
  return exchange(user, undefined, 'current_session');
}

export async function chooseCurrentSessionOrganization(organizationId: string): Promise<DirectEntryResult> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('CURRENT_SESSION_EXPIRED');
  return exchange(user, organizationId, 'current_session');
}
