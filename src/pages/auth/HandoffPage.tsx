import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { useAuth } from '@/src/hooks/useAuth';
import { signInWithCustomToken } from 'firebase/auth';
import { firebaseAuth } from '@/src/lib/firebase';

type HandoffStatus = 
  | 'validating' 
  | 'redeeming' 
  | 'signing_in' 
  | 'success' 
  | 'invalid_or_expired' 
  | 'service_unavailable' 
  | 'unexpected_error';

const inProgressCodes = new Set<string>();

export default function HandoffPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { authState, user } = useAuth();
  const [status, setStatus] = useState<HandoffStatus>('validating');

  useEffect(() => {
    if (authState === 'initializing') {
      return; // wait for firebase auth to be ready
    }

    const rawCode = searchParams.get('code');

    if (!rawCode) {
      if (authState === 'authenticated' && user) {
        navigate(APP_ROUTES.finance, { replace: true });
      } else {
        setStatus('invalid_or_expired');
      }
      return;
    }

    const isFormatValid = /^[A-Za-z0-9_-]{43}$/.test(rawCode);

    if (!isFormatValid) {
      navigate(APP_ROUTES.handoff, { replace: true });
      setStatus('invalid_or_expired');
      return;
    }

    navigate(APP_ROUTES.handoff, { replace: true });

    if (inProgressCodes.has(rawCode)) {
      return;
    }

    inProgressCodes.add(rawCode);

    async function redeemCode() {
      try {
        setStatus('redeeming');
        const response = await fetch('/api/auth/handoff/redeem', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ code: rawCode }),
          cache: 'no-store',
        });

        if (!response.ok) {
          if (response.status === 400) {
            setStatus('invalid_or_expired');
          } else if (response.status === 503) {
            setStatus('service_unavailable');
          } else {
            setStatus('unexpected_error');
          }
          return;
        }

        const data = await response.json();
        
        if (!data || typeof data.customToken !== 'string') {
          setStatus('unexpected_error');
          return;
        }

        setStatus('signing_in');
        
        await signInWithCustomToken(firebaseAuth, data.customToken);
        
        setStatus('success');
        navigate(APP_ROUTES.finance, { replace: true });
      } catch (err) {
        setStatus('unexpected_error');
      } finally {
        inProgressCodes.delete(rawCode);
      }
    }

    redeemCode();
  }, [searchParams, navigate, authState, user]);

  let statusText = '';
  const isLoading = ['validating', 'redeeming', 'signing_in'].includes(status);

  switch (status) {
    case 'validating':
      statusText = 'Validando acesso seguro...';
      break;
    case 'redeeming':
      statusText = 'Conectando ao MillionsNest...';
      break;
    case 'signing_in':
      statusText = 'Autenticando sua sessão...';
      break;
    case 'success':
      statusText = 'Entrando...';
      break;
    case 'invalid_or_expired':
      statusText = 'Este acesso expirou ou já foi utilizado.';
      break;
    case 'service_unavailable':
      statusText = 'O acesso ao NestFinance está temporariamente indisponível.';
      break;
    case 'unexpected_error':
    default:
      statusText = 'Não foi possível concluir o acesso.';
      break;
  }

  return (
    <div className="min-h-screen bg-background-base flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full flex flex-col items-center space-y-4 fade-in">
        <h1 className="text-xl font-medium text-text-primary">Acesso Seguro</h1>
        <p className="text-sm text-text-secondary">
          {statusText}
        </p>
        {isLoading && (
          <div className="w-6 h-6 rounded-full border-2 border-surface-elevated border-t-accent-primary animate-spin mt-4" />
        )}
      </div>
    </div>
  );
}
