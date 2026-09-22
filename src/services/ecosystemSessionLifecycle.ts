export type NestFinanceSessionOrigin = 'hub' | 'direct';

const SESSION_ORIGIN_KEY = 'nf_session_origin';
const HUB_HOME_URL = 'https://www.millionsnest.com/';
const HUB_NESTFINANCE_LAUNCH_URL = 'https://www.millionsnest.com/apps/nestfinance/launch';

function safeReturnPath(candidate: string): string {
  const value = String(candidate || '/finance').trim();
  return value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('://') &&
    !value.includes('\\')
    ? value
    : '/finance';
}

export function markNestFinanceSessionOrigin(origin: NestFinanceSessionOrigin): void {
  try {
    sessionStorage.setItem(SESSION_ORIGIN_KEY, origin);
  } catch {}
}

export function readNestFinanceSessionOrigin(): NestFinanceSessionOrigin | null {
  try {
    const value = sessionStorage.getItem(SESSION_ORIGIN_KEY);
    return value === 'hub' || value === 'direct' ? value : null;
  } catch {
    return null;
  }
}

export function clearNestFinanceSessionLifecycle(): void {
  try {
    sessionStorage.removeItem(SESSION_ORIGIN_KEY);
    sessionStorage.removeItem('mn_ecosystem_org_id');
    sessionStorage.removeItem('mn_sso_recovery_nestfinance');
  } catch {}
}

export function buildMillionsNestLaunchUrl(returnTo = '/finance'): string {
  const url = new URL(HUB_NESTFINANCE_LAUNCH_URL);
  url.searchParams.set('returnTo', safeReturnPath(returnTo));
  return url.toString();
}

export function openMillionsNestHome(replace = false): void {
  if (replace) window.location.replace(HUB_HOME_URL);
  else window.location.assign(HUB_HOME_URL);
}

export function recoverRevokedHubSession(returnTo = '/finance'): boolean {
  if (readNestFinanceSessionOrigin() !== 'hub') return false;
  window.location.replace(buildMillionsNestLaunchUrl(returnTo));
  return true;
}
