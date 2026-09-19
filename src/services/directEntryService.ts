import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  setPersistence,
  signInWithCustomToken,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { firebaseAuth, firebaseConfig } from '../lib/firebase';

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

async function exchange(user: User, organizationId?: string): Promise<DirectEntryResult> {
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
    await signOut(directAuth).catch(() => undefined);
    throw new Error('DIRECT_IDENTITY_EXPIRED');
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
    await signOut(directAuth).catch(() => undefined);
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

export async function startGoogleDirectEntry(): Promise<DirectEntryResult | { status: 'redirecting' }> {
  await setPersistence(directAuth, browserLocalPersistence);

  try {
    const credential = await signInWithPopup(directAuth, googleProvider);
    return await exchange(credential.user);
  } catch (error: any) {
    if (
      error?.code === 'auth/popup-blocked' ||
      error?.code === 'auth/operation-not-supported-in-this-environment' ||
      error?.code === 'auth/web-storage-unsupported'
    ) {
      try { sessionStorage.setItem(REDIRECT_PENDING_KEY, '1'); } catch {}
      await signInWithRedirect(directAuth, googleProvider);
      return { status: 'redirecting' };
    }
    throw error;
  }
}

export async function finishGoogleRedirectEntry(): Promise<DirectEntryResult | null> {
  let pending = false;
  try { pending = sessionStorage.getItem(REDIRECT_PENDING_KEY) === '1'; } catch {}
  if (!pending) return null;

  const result = await getRedirectResult(directAuth);
  try { sessionStorage.removeItem(REDIRECT_PENDING_KEY); } catch {}

  if (!result?.user) return null;
  return exchange(result.user);
}

export async function chooseDirectEntryOrganization(organizationId: string): Promise<DirectEntryResult> {
  const user = directAuth.currentUser;
  if (!user) throw new Error('DIRECT_IDENTITY_EXPIRED');
  return exchange(user, organizationId);
}

export async function clearDirectEntryIdentity() {
  await signOut(directAuth).catch(() => undefined);
}
