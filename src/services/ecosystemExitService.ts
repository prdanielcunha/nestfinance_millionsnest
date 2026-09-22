import { firebaseAuth } from '../lib/firebase';
import { clearDirectEntryIdentity } from './directEntryService';
import {
  clearNestFinanceSessionLifecycle,
  openMillionsNestHome,
} from './ecosystemSessionLifecycle';
import { clearSessionResolutionCache } from './sessionResolutionService';

export async function signOutNestFinanceAndReturnToHub(): Promise<void> {
  clearSessionResolutionCache();

  await Promise.all([
    firebaseAuth.signOut().catch(() => undefined),
    clearDirectEntryIdentity().catch(() => undefined),
  ]);

  clearNestFinanceSessionLifecycle();
  openMillionsNestHome(true);
}

export function returnToMillionsNest(): void {
  openMillionsNestHome(false);
}
