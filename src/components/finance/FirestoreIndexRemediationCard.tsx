import type { FC } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button, Surface } from '@/src/components/foundation';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';

export interface FirestoreIndexRemediationProps {
  remediation?: { type: string; url?: string };
  requestId?: string;
  errorText?: string;
  onRetry: () => void;
}

const COPY: Record<Language, {
  title: string;
  description: string;
  retry: string;
  supportCode: string;
}> = {
  PT: {
    title: 'Não foi possível carregar estes dados agora',
    description: 'Nada foi alterado. Tente novamente em instantes. Se continuar acontecendo, informe o código de suporte para que possamos verificar.',
    retry: 'Tentar novamente',
    supportCode: 'Código de suporte',
  },
  EN: {
    title: 'We could not load this data right now',
    description: 'Nothing was changed. Try again in a moment. If this keeps happening, share the support code so we can investigate.',
    retry: 'Try again',
    supportCode: 'Support code',
  },
  ES: {
    title: 'No pudimos cargar estos datos ahora',
    description: 'No se modificó nada. Inténtalo de nuevo en unos instantes. Si continúa ocurriendo, informa el código de soporte para que podamos revisarlo.',
    retry: 'Intentar de nuevo',
    supportCode: 'Código de soporte',
  },
};

export const FirestoreIndexRemediationCard: FC<FirestoreIndexRemediationProps> = ({
  requestId,
  onRetry,
}) => {
  const { language } = useLanguage();
  const copy = COPY[language];

  return (
    <Surface
      variant="elevated"
      radius="xl"
      role="alert"
      aria-live="polite"
      className="mx-auto my-12 flex max-w-md flex-col items-center p-6 text-center sm:p-8"
    >
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-semantic-warning/20 bg-semantic-warning/10 text-semantic-warning">
        <AlertCircle className="h-6 w-6" aria-hidden="true" />
      </div>

      <h3 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl">
        {copy.title}
      </h3>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        {copy.description}
      </p>

      <Button
        variant="secondary"
        size="lg"
        fullWidth
        leadingIcon={<RefreshCw className="h-4 w-4" />}
        onClick={onRetry}
        className="mt-6"
      >
        {copy.retry}
      </Button>

      {requestId ? (
        <p className="mt-5 max-w-full break-all text-xs text-text-muted">
          <span className="font-medium">{copy.supportCode}:</span>{' '}
          <span className="font-mono select-all">{requestId}</span>
        </p>
      ) : null}
    </Surface>
  );
};
