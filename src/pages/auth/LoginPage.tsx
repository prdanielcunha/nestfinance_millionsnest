import { useEffect, useMemo, useState } from 'react';
import { Building2, ChevronRight, Loader2, LogIn, ShieldCheck } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { NestFinanceLogo } from '@/src/components/brand/NestFinanceLogo';
import { APP_ROUTES } from '@/src/app/router/routes';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';
import {
  chooseDirectEntryOrganization,
  clearDirectEntryIdentity,
  finishGoogleRedirectEntry,
  startGoogleDirectEntry,
  type DirectEntryOrganization,
  type DirectEntryResult,
} from '@/src/services/directEntryService';

const HUB_LAUNCH_URL = 'https://www.millionsnest.com/apps/nestfinance/launch';

const copy: Record<Language, Record<string, string>> = {
  PT: {
    title: 'Entre para continuar',
    subtitle: 'Use sua conta MillionsNest. Suas organizações e permissões serão confirmadas com segurança.',
    google: 'Continuar com Google',
    hub: 'Entrar pelo MillionsNest',
    secure: 'Sua conta identifica você. O MillionsNest confirma o que você pode acessar.',
    working: 'Confirmando sua conta e seu acesso…',
    chooseTitle: 'Onde você quer trabalhar?',
    chooseSubtitle: 'Esta conta tem acesso a mais de uma organização.',
    noAccessTitle: 'Esta conta ainda não tem acesso ao NestFinance',
    noAccessText: 'Você pode usar outra conta Google ou abrir o MillionsNest para conferir seu acesso.',
    another: 'Usar outra conta Google',
    unavailableTitle: 'Não foi possível concluir o acesso',
    unavailableText: 'Sua sessão foi preservada. Tente novamente ou entre pelo MillionsNest.',
    retry: 'Tentar novamente',
  },
  EN: {
    title: 'Sign in to continue',
    subtitle: 'Use your MillionsNest account. Your organizations and permissions will be securely confirmed.',
    google: 'Continue with Google',
    hub: 'Sign in through MillionsNest',
    secure: 'Your account identifies you. MillionsNest confirms what you can access.',
    working: 'Confirming your account and access…',
    chooseTitle: 'Where do you want to work?',
    chooseSubtitle: 'This account can access more than one organization.',
    noAccessTitle: 'This account does not have NestFinance access yet',
    noAccessText: 'You can use another Google account or open MillionsNest to review your access.',
    another: 'Use another Google account',
    unavailableTitle: 'We could not complete sign-in',
    unavailableText: 'Your session is safe. Try again or sign in through MillionsNest.',
    retry: 'Try again',
  },
  ES: {
    title: 'Inicia sesión para continuar',
    subtitle: 'Usa tu cuenta MillionsNest. Tus organizaciones y permisos se confirmarán de forma segura.',
    google: 'Continuar con Google',
    hub: 'Entrar por MillionsNest',
    secure: 'Tu cuenta te identifica. MillionsNest confirma a qué puedes acceder.',
    working: 'Confirmando tu cuenta y acceso…',
    chooseTitle: '¿Dónde quieres trabajar?',
    chooseSubtitle: 'Esta cuenta tiene acceso a más de una organización.',
    noAccessTitle: 'Esta cuenta todavía no tiene acceso a NestFinance',
    noAccessText: 'Puedes usar otra cuenta de Google o abrir MillionsNest para revisar tu acceso.',
    another: 'Usar otra cuenta de Google',
    unavailableTitle: 'No pudimos completar el acceso',
    unavailableText: 'Tu sesión está protegida. Inténtalo de nuevo o entra por MillionsNest.',
    retry: 'Intentar de nuevo',
  },
};

type ViewState = 'idle' | 'loading' | 'choose' | 'no_access' | 'error';

function safeReturnPath(candidate: string | null): string {
  const value = String(candidate || APP_ROUTES.finance).trim();
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('://') && !value.includes('\\')
    ? value
    : APP_ROUTES.finance;
}

function googleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
      <path fill="#4285F4" d="M21.8 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.8 3-4.4 3-7.6Z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.8-2.4l-3.3-2.6c-.9.6-2.1 1-3.5 1a6 6 0 0 1-5.6-4.1H3v2.7A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.4 13.9A6 6 0 0 1 6.1 12c0-.7.1-1.3.3-1.9V7.4H3A10 10 0 0 0 2 12c0 1.6.4 3.2 1 4.6l3.4-2.7Z" />
      <path fill="#EA4335" d="M12 6c1.6 0 3 .5 4 1.6L19 4.7A10 10 0 0 0 3 7.4l3.4 2.7A6 6 0 0 1 12 6Z" />
    </svg>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { language } = useLanguage();
  const c = copy[language];
  const returnTo = useMemo(() => safeReturnPath(searchParams.get('returnTo')), [searchParams]);
  const [view, setView] = useState<ViewState>('idle');
  const [organizations, setOrganizations] = useState<DirectEntryOrganization[]>([]);
  const [errorDetail, setErrorDetail] = useState('');

  const complete = (result: DirectEntryResult) => {
    if (result.status === 'ready') {
      navigate(returnTo === APP_ROUTES.login ? APP_ROUTES.finance : returnTo, { replace: true });
      return;
    }
    if (result.status === 'choose_organization') {
      setOrganizations(result.organizations);
      setView('choose');
      return;
    }
    setView('no_access');
  };

  useEffect(() => {
    let active = true;
    void finishGoogleRedirectEntry()
      .then((result) => {
        if (!active || !result) return;
        setView('loading');
        complete(result);
      })
      .catch((error) => {
        if (!active) return;
        setErrorDetail(error instanceof Error ? error.message : '');
        setView('error');
      });
    return () => { active = false; };
  }, []);

  const beginGoogle = async () => {
    setErrorDetail('');
    setView('loading');
    try {
      const result = await startGoogleDirectEntry();
      if (result.status === 'redirecting') return;
      complete(result);
    } catch (error) {
      setErrorDetail(error instanceof Error ? error.message : '');
      setView('error');
    }
  };

  const chooseOrganization = async (organizationId: string) => {
    setView('loading');
    try {
      complete(await chooseDirectEntryOrganization(organizationId));
    } catch (error) {
      setErrorDetail(error instanceof Error ? error.message : '');
      setView('error');
    }
  };

  const useAnotherAccount = async () => {
    await clearDirectEntryIdentity();
    await beginGoogle();
  };

  const openHub = () => {
    const url = new URL(HUB_LAUNCH_URL);
    url.searchParams.set('returnTo', returnTo);
    window.location.assign(url.toString());
  };

  return (
    <main className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-background-base px-5 py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(0,214,239,.12),transparent_36%),radial-gradient(circle_at_90%_90%,rgba(212,175,122,.08),transparent_30%)]" />
      <section className="relative w-full max-w-[430px]">
        <div className="mb-8 flex justify-center">
          <NestFinanceLogo layout="horizontal" surface="dark" className="w-[280px] max-w-[72vw] opacity-95" priority />
        </div>

        <div className="nf-glass rounded-[1.6rem] p-6 sm:p-7">
          {view === 'loading' ? (
            <div className="py-10 text-center" aria-live="polite">
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-accent-primary" />
              <p className="mt-5 text-sm text-text-secondary">{c.working}</p>
            </div>
          ) : view === 'choose' ? (
            <div>
              <div className="mb-6">
                <h1 className="text-[1.45rem] font-semibold tracking-[-0.035em] text-text-primary">{c.chooseTitle}</h1>
                <p className="mt-2 text-sm leading-6 text-text-secondary">{c.chooseSubtitle}</p>
              </div>
              <div className="space-y-2">
                {organizations.map((organization) => (
                  <button
                    key={organization.id}
                    type="button"
                    onClick={() => chooseOrganization(organization.id)}
                    className="nf-interactive flex min-h-16 w-full items-center gap-3 rounded-[1rem] border border-border-subtle bg-white/[0.025] px-4 text-left hover:border-border-strong hover:bg-white/[0.05]"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-text-secondary">
                      <Building2 className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm font-semibold text-text-primary">{organization.name}</strong>
                      {organization.slug ? <span className="mt-0.5 block truncate text-xs text-text-muted">{organization.slug}</span> : null}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
                  </button>
                ))}
              </div>
              <button type="button" onClick={useAnotherAccount} className="mt-5 w-full py-3 text-sm font-medium text-text-secondary hover:text-text-primary">
                {c.another}
              </button>
            </div>
          ) : view === 'no_access' ? (
            <div className="text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-brand-gold/20 bg-brand-gold/[0.07] text-brand-gold">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h1 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-text-primary">{c.noAccessTitle}</h1>
              <p className="mt-2 text-sm leading-6 text-text-secondary">{c.noAccessText}</p>
              <div className="mt-6 space-y-2">
                <button type="button" onClick={useAnotherAccount} className="nf-interactive flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-text-primary px-4 text-sm font-semibold text-background-base hover:opacity-90">
                  {googleMark()} {c.another}
                </button>
                <button type="button" onClick={openHub} className="nf-interactive min-h-12 w-full rounded-xl border border-border-subtle bg-white/[0.025] px-4 text-sm font-semibold text-text-primary hover:bg-white/[0.05]">
                  {c.hub}
                </button>
              </div>
            </div>
          ) : view === 'error' ? (
            <div className="text-center">
              <h1 className="text-xl font-semibold tracking-[-0.03em] text-text-primary">{c.unavailableTitle}</h1>
              <p className="mt-2 text-sm leading-6 text-text-secondary">{c.unavailableText}</p>
              {import.meta.env.DEV && errorDetail ? <p className="mt-3 font-mono text-[10px] text-text-muted">{errorDetail}</p> : null}
              <div className="mt-6 space-y-2">
                <button type="button" onClick={beginGoogle} className="nf-interactive min-h-12 w-full rounded-xl bg-text-primary px-4 text-sm font-semibold text-background-base hover:opacity-90">{c.retry}</button>
                <button type="button" onClick={openHub} className="nf-interactive min-h-12 w-full rounded-xl border border-border-subtle bg-white/[0.025] px-4 text-sm font-semibold text-text-primary hover:bg-white/[0.05]">{c.hub}</button>
              </div>
            </div>
          ) : (
            <div>
              <div className="text-center">
                <h1 className="text-[1.55rem] font-semibold tracking-[-0.04em] text-text-primary">{c.title}</h1>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-text-secondary">{c.subtitle}</p>
              </div>

              <div className="mt-7 space-y-3">
                <button
                  type="button"
                  onClick={beginGoogle}
                  className="nf-interactive flex min-h-13 w-full items-center justify-center gap-3 rounded-xl bg-text-primary px-4 text-sm font-semibold text-background-base hover:opacity-90"
                >
                  {googleMark()} {c.google}
                </button>
                <button
                  type="button"
                  onClick={openHub}
                  className="nf-interactive flex min-h-13 w-full items-center justify-center gap-2 rounded-xl border border-border-subtle bg-white/[0.025] px-4 text-sm font-semibold text-text-primary hover:bg-white/[0.05]"
                >
                  <LogIn className="h-4 w-4" /> {c.hub}
                </button>
              </div>

              <div className="mt-6 flex items-start gap-2 rounded-xl border border-border-subtle bg-black/10 px-3.5 py-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                <p className="text-[11px] leading-5 text-text-muted">{c.secure}</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
