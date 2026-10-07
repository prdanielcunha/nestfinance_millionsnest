import { createNestAiClient, type Locale, type NestAiClient } from '@millionsnest/ai';
import type { VercelRequest } from '@vercel/node';

function header(req: VercelRequest, name: string): string {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
}

export function financeNestAiLocale(value: unknown): Locale {
  const raw = String(value || 'PT').toLowerCase();
  if (raw.startsWith('en')) return 'en';
  if (raw.startsWith('es')) return 'es';
  return 'pt-BR';
}

export function createFinanceNestAiClient(input: {
  req: VercelRequest;
  organizationId: string;
  locale?: unknown;
  fetcher?: typeof fetch;
}): NestAiClient {
  const authorization = header(input.req, 'authorization').trim();
  const appCheck = header(input.req, 'x-firebase-appcheck').trim();
  if (!authorization.startsWith('Bearer ')) throw new Error('NESTAI_FIREBASE_AUTH_REQUIRED');
  if (!appCheck) throw new Error('NESTAI_APP_CHECK_REQUIRED');

  const organizationId = String(input.organizationId || '').trim();
  if (!organizationId || organizationId.length > 256 || organizationId.includes('/')) {
    throw new Error('NESTAI_ORGANIZATION_INVALID');
  }

  const fetcher = input.fetcher ?? fetch;
  const locale = financeNestAiLocale(input.locale);
  let tokenPromise: Promise<string> | null = null;

  return createNestAiClient({
    appId: 'nestfinance',
    organizationId,
    locale,
    baseUrl: process.env.NESTAI_BASE_URL || 'https://ai.millionsnest.com/v1/',
    hubBaseUrl: process.env.MILLIONSNEST_HUB_BASE_URL || 'https://www.millionsnest.com/',
    getToken: async () => {
      if (!tokenPromise) {
        tokenPromise = (async () => {
          const response = await fetcher(
            new URL('api/v1/ai/token', process.env.MILLIONSNEST_HUB_BASE_URL || 'https://www.millionsnest.com/'),
            {
              method: 'POST',
              headers: {
                authorization,
                'x-firebase-appcheck': appCheck,
                'content-type': 'application/json',
              },
              body: JSON.stringify({ organizationId, appId: 'nestfinance', locale }),
            },
          );
          const body = await response.json() as { token?: string; error?: string };
          if (!response.ok || !body.token) throw new Error(body.error || 'NESTAI_HUB_TOKEN_FAILED');
          return body.token;
        })();
      }
      return tokenPromise;
    },
    getAppCheckToken: async () => appCheck,
    fetcher,
  });
}

export function financeNestAiModelLabel(): string {
  return 'nestai-managed';
}
