import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { APP_ROUTES } from '@/src/app/router/routes';
import { useAuth } from '@/src/hooks/useAuth';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';
import { hasAnyEffectiveCapability } from '@/src/lib/permissions';
import { Button, Surface } from '@/src/components/foundation';

const COPY: Record<Language, { title: string; text: string; action: string }> = {
  PT: {
    title: 'Este espaço não faz parte da sua função',
    text: 'Seu acesso ao NestFinance está ativo, mas esta área exige uma permissão financeira que não faz parte do seu perfil atual.',
    action: 'Voltar para Hoje',
  },
  EN: {
    title: 'This workspace is not part of your role',
    text: 'Your NestFinance access is active, but this area requires a finance permission that is not part of your current profile.',
    action: 'Back to Today',
  },
  ES: {
    title: 'Este espacio no forma parte de tu función',
    text: 'Tu acceso a NestFinance está activo, pero esta área requiere un permiso financiero que no forma parte de tu perfil actual.',
    action: 'Volver a Hoy',
  },
};

export function FinanceCapabilityBoundary({
  anyOf,
  children,
}: {
  anyOf: readonly string[];
  children: ReactNode;
}) {
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const copy = COPY[language];

  if (hasAnyEffectiveCapability(accessState, anyOf)) {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center">
      <Surface variant="elevated" radius="xl" className="w-full p-6 text-center sm:p-8">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-secondary text-text-secondary">
          <ShieldAlert className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">{copy.title}</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-text-secondary">{copy.text}</p>
        <Button variant="primary" size="lg" className="mt-6" onClick={() => navigate(APP_ROUTES.finance, { replace: true })}>
          {copy.action}
        </Button>
      </Surface>
    </div>
  );
}
