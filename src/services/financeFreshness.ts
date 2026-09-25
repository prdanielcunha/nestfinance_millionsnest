export type FinanceDataArea =
  | 'transactions'
  | 'count'
  | 'inbox'
  | 'reports'
  | 'settings'
  | 'unknown';

export type FinanceDataChangeDetail = {
  organizationId: string;
  financeEntityId: string;
  area: FinanceDataArea;
  occurredAt: number;
};

const LOCAL_EVENT = 'nestfinance:finance-data-changed';
const CHANNEL_NAME = 'nestfinance-finance-freshness';

export function notifyFinanceDataChanged(
  detail: Omit<FinanceDataChangeDetail, 'occurredAt'> & { occurredAt?: number },
) {
  if (typeof window === 'undefined') return;

  const payload: FinanceDataChangeDetail = {
    ...detail,
    occurredAt: detail.occurredAt ?? Date.now(),
  };

  window.dispatchEvent(new CustomEvent<FinanceDataChangeDetail>(LOCAL_EVENT, { detail: payload }));

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(payload);
      channel.close();
    } catch {
      // Freshness is best-effort. Canonical data remains server-side.
    }
  }
}

export function subscribeFinanceDataChanges(
  listener: (detail: FinanceDataChangeDetail) => void,
) {
  if (typeof window === 'undefined') return () => {};

  const handleLocal = (event: Event) => {
    listener((event as CustomEvent<FinanceDataChangeDetail>).detail);
  };

  window.addEventListener(LOCAL_EVENT, handleLocal);

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.addEventListener('message', (event: MessageEvent<FinanceDataChangeDetail>) => {
        if (event.data) listener(event.data);
      });
    } catch {
      channel = null;
    }
  }

  return () => {
    window.removeEventListener(LOCAL_EVENT, handleLocal);
    channel?.close();
  };
}
