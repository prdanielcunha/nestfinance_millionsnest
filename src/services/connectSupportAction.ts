export type SupportSession = { uid: string; organizationId: string; getToken(): Promise<string> };
type Popup = { closed: boolean; opener: unknown; location: { href: string }; close(): void };

/** Click-triggered only; cancel on logout, scope changes, dismissal or unmount. */
export function createConnectSupportAction(options: {
  session(): SupportSession | null;
  fetch: typeof fetch;
  popup(): Popup | null;
  navigate(url: string): void;
  state(busy: boolean, failed: boolean): void;
}) {
  let epoch = 0, busy = false, popup: Popup | null = null, abort: AbortController | null = null;
  const cancel = () => { epoch++; busy = false; abort?.abort(); abort = null; popup?.close(); popup = null; };
  return {
    cancel,
    async open(locale: 'pt-BR' | 'en-US' | 'es-ES') {
      const session = options.session();
      if (!session || busy) return;
      const generation = ++epoch;
      const current = () => { const latest = options.session(); return generation === epoch && latest?.uid === session.uid && latest?.organizationId === session.organizationId; };
      busy = true;
      const controller = new AbortController(); abort = controller;
      let target: Popup | null = null, failed = false;
      try {
        target = options.popup(); popup = target;
        if (target) target.opener = null;
        options.state(true, false);
        const token = await session.getToken();
        if (!current()) { target?.close(); return; }
        const response = await options.fetch('/api/system-gateway?operation=connect-support-draft', {
          method: 'POST', signal: controller.signal,
          headers: { Authorization: `Bearer ${token}`, 'X-Connect-User-Authorization': `Bearer ${token}`, 'x-organization-id': session.organizationId, 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale }),
        });
        if (!response.ok) throw new Error();
        const data = await response.json(), url = new URL(data.draftUrl);
        if (data.product !== 'nestfinance' || data.automaticSend !== false || url.origin !== 'https://wa.me' || url.username || url.password || url.hash ||
            !/^\/[1-9][0-9]{7,14}$/.test(url.pathname) || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Date.now() || data.expiresAt > Date.now() + 630000 ||
            [...url.searchParams.keys()].length !== 1 || !url.searchParams.get('text') || url.searchParams.get('text')!.length > 2048 || url.searchParams.get('text')!.includes(token)) throw new Error();
        if (!current()) { target?.close(); return; }
        if (target) { if (!target.closed) target.location.href = url.toString(); } else options.navigate(url.toString());
        // Once deliberately opened, subsequent unmount/logout must not close WhatsApp.
        popup = null;
      } catch { target?.close(); failed = true; }
      finally { if (generation === epoch) { busy = false; abort = null; options.state(false, failed && current()); } }
    },
  };
}
