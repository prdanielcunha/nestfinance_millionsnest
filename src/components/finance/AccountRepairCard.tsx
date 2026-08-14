import { useEffect, useId, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  RefreshCw,
  X,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';
import { firebaseAuth } from '@/src/lib/firebase';

interface Props {
  account: {
    id: string;
    name: string;
    templateKey?: string | null;
    type?: string;
    nature?: string;
    configurationStatus?: string;
    institutionName?: string | null;
    accountLast4?: string | null;
  };
  financeEntityId: string;
  onRepaired: (repairedAccount: any) => void;
}

const UI_COPY: Record<
  Language,
  {
    unauthenticated: string;
    repairFailed: string;
    configureTitle: (name: string) => string;
    configureSubtitle: string;
    close: string;
    representationQuestion: string;
    representations: Record<string, string>;
    save: string;
    saving: string;
    success: string;
    ready: (name: string) => string;
    preparing: (name: string) => string;
    preparationFailed: (name: string) => string;
    needsAdjustment: (name: string) => string;
    needsAdjustmentBody: string;
    resolveNow: string;
    selectRepresentation: string;
  }
> = {
  PT: {
    unauthenticated: 'Sua sessão precisa ser renovada.',
    repairFailed: 'Não foi possível preparar esta conta agora. Tente novamente.',
    configureTitle: (name) => `Configurar ${name}`,
    configureSubtitle: 'Responda apenas o que esta conta representa para a igreja.',
    close: 'Fechar configuração da conta',
    representationQuestion: 'O que esta conta representa?',
    representations: {
      cash: 'Dinheiro guardado fisicamente',
      bank_checking: 'Conta bancária',
      payment_account: 'Conta Pix ou carteira digital',
      credit_card: 'Cartão de crédito da igreja',
      reimbursement_payable: 'Valor que a igreja precisa reembolsar',
      card_receivable: 'Valor que a igreja tem para receber',
      other: 'Outra conta',
    },
    save: 'Salvar e concluir',
    saving: 'Salvando...',
    success: 'Conta configurada com sucesso.',
    ready: (name) => `${name} está pronta para usar.`,
    preparing: (name) => `Preparando ${name} para uso...`,
    preparationFailed: (name) => `Não foi possível preparar ${name}.`,
    needsAdjustment: (name) => `${name} precisa de um ajuste rápido`,
    needsAdjustmentBody: 'Diga apenas o que esta conta representa para a igreja.',
    resolveNow: 'Resolver agora',
    selectRepresentation: 'Escolha o que esta conta representa.',
  },
  EN: {
    unauthenticated: 'Your session needs to be renewed.',
    repairFailed: 'This account could not be prepared right now. Try again.',
    configureTitle: (name) => `Configure ${name}`,
    configureSubtitle: 'Answer only what this account represents for the church.',
    close: 'Close account setup',
    representationQuestion: 'What does this account represent?',
    representations: {
      cash: 'Physical cash',
      bank_checking: 'Bank account',
      payment_account: 'Pix account or digital wallet',
      credit_card: 'Church credit card',
      reimbursement_payable: 'Amount the church must reimburse',
      card_receivable: 'Amount the church is due to receive',
      other: 'Another account',
    },
    save: 'Save and finish',
    saving: 'Saving...',
    success: 'Account configured successfully.',
    ready: (name) => `${name} is ready to use.`,
    preparing: (name) => `Preparing ${name} for use...`,
    preparationFailed: (name) => `Could not prepare ${name}.`,
    needsAdjustment: (name) => `${name} needs a quick adjustment`,
    needsAdjustmentBody: 'Tell us only what this account represents for the church.',
    resolveNow: 'Resolve now',
    selectRepresentation: 'Choose what this account represents.',
  },
  ES: {
    unauthenticated: 'Tu sesión necesita renovarse.',
    repairFailed: 'No fue posible preparar esta cuenta ahora. Inténtalo de nuevo.',
    configureTitle: (name) => `Configurar ${name}`,
    configureSubtitle: 'Responde solamente qué representa esta cuenta para la iglesia.',
    close: 'Cerrar configuración de la cuenta',
    representationQuestion: '¿Qué representa esta cuenta?',
    representations: {
      cash: 'Dinero guardado físicamente',
      bank_checking: 'Cuenta bancaria',
      payment_account: 'Cuenta Pix o billetera digital',
      credit_card: 'Tarjeta de crédito de la iglesia',
      reimbursement_payable: 'Valor que la iglesia debe reembolsar',
      card_receivable: 'Valor que la iglesia debe recibir',
      other: 'Otra cuenta',
    },
    save: 'Guardar y concluir',
    saving: 'Guardando...',
    success: 'Cuenta configurada correctamente.',
    ready: (name) => `${name} está lista para usar.`,
    preparing: (name) => `Preparando ${name} para usar...`,
    preparationFailed: (name) => `No fue posible preparar ${name}.`,
    needsAdjustment: (name) => `${name} necesita un ajuste rápido`,
    needsAdjustmentBody: 'Indica solamente qué representa esta cuenta para la iglesia.',
    resolveNow: 'Resolver ahora',
    selectRepresentation: 'Elige qué representa esta cuenta.',
  },
};

const REPRESENTATIONS = [
  'cash',
  'bank_checking',
  'payment_account',
  'credit_card',
  'reimbursement_payable',
  'card_receivable',
  'other',
] as const;

export default function AccountRepairCard({
  account,
  financeEntityId,
  onRepaired,
}: Props) {
  const { language } = useLanguage();
  const copy = UI_COPY[language];
  const dialogTitleId = useId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showConfigWizard, setShowConfigWizard] = useState(false);
  const [representation, setRepresentation] = useState('');

  const isIncomplete =
    account.configurationStatus !== 'complete' ||
    !account.type ||
    !account.nature;

  const CANONICAL_TEMPLATES: Record<
    string,
    { type: string; nature: string }
  > = {
    'church.account.cash': { type: 'cash', nature: 'asset' },
    'church.account.checking': { type: 'bank_checking', nature: 'asset' },
    'church.account.savings': { type: 'bank_savings', nature: 'asset' },
    'church.account.digital_wallet': {
      type: 'payment_account',
      nature: 'asset',
    },
  };

  const isCanonical =
    Boolean(account.templateKey) &&
    Boolean(account.templateKey && CANONICAL_TEMPLATES[account.templateKey]);
  const suggested = account.templateKey
    ? CANONICAL_TEMPLATES[account.templateKey]
    : null;

  const handleRepair = async () => {
    if (loading || !suggested) return;
    try {
      setLoading(true);
      setError(null);
      const user = firebaseAuth.currentUser;
      if (!user) throw new Error('UNAUTHENTICATED');
      const token = await user.getIdToken();

      const response = await fetch(
        '/api/finance-gateway?operation=accounts-repair-canonical',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            financeEntityId,
            accountId: account.id,
            requestId: `req_rep_${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`,
            idempotencyKey: `idk_rep_${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`,
          }),
        },
      );

      if (!response.ok) throw new Error('ACCOUNT_REPAIR_FAILED');
      const data = await response.json().catch(() => ({}));
      const result = data.results?.[0];
      if (
        result &&
        (result.status === 'repaired' || result.status === 'already_complete')
      ) {
        setSuccess(true);
        setTimeout(() => {
          onRepaired({
            ...account,
            type: suggested.type,
            nature: suggested.nature,
            configurationStatus: 'complete',
          });
        }, 900);
      } else {
        throw new Error('ACCOUNT_REPAIR_FAILED');
      }
    } catch {
      setError(copy.repairFailed);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (
      isIncomplete &&
      isCanonical &&
      suggested &&
      !loading &&
      !success &&
      !error
    ) {
      void handleRepair();
    }
    // Canonical repair should start once for an incomplete canonical account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id, isCanonical, isIncomplete]);

  if (!isIncomplete) return null;

  const handleSaveCustomConfig = async () => {
    if (loading) return;
    try {
      setLoading(true);
      setError(null);
      if (!representation) {
        setError(copy.selectRepresentation);
        return;
      }

      const purposeByRepresentation: Record<string, string> = {
        cash: 'physical_cash',
        bank_checking: 'bank_account',
        payment_account: 'digital_payment_account',
        credit_card: 'church_credit_card',
        reimbursement_payable: 'reimbursement_payable',
        card_receivable: 'card_receivable',
        other: 'other_asset',
      };

      const user = firebaseAuth.currentUser;
      if (!user) throw new Error('UNAUTHENTICATED');
      const token = await user.getIdToken();
      const response = await fetch(
        '/api/finance-gateway?operation=accounts-configure-custom',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            accountId: account.id,
            purposeCode: purposeByRepresentation[representation],
            requestId: `req_conf_${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`,
            idempotencyKey: `idk_conf_${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`,
          }),
        },
      );

      if (!response.ok) throw new Error('ACCOUNT_CONFIG_FAILED');
      const data = await response.json().catch(() => ({}));
      const configuredAccount = data.results?.[0]?.account;
      if (!configuredAccount) throw new Error('ACCOUNT_CONFIG_FAILED');

      setSuccess(true);
      setTimeout(() => {
        setShowConfigWizard(false);
        onRepaired({ ...account, ...configuredAccount });
      }, 700);
    } catch {
      setError(copy.repairFailed);
    } finally {
      setLoading(false);
    }
  };

  const renderWizardModal = () => {
    if (!showConfigWizard) return null;

    return createPortal(
      <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
        <button
          type="button"
          aria-label={copy.close}
          className="absolute inset-0 bg-background-base/80 backdrop-blur-sm"
          onClick={() => !loading && setShowConfigWizard(false)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={dialogTitleId}
          className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl border border-border-subtle bg-surface-elevated shadow-2xl sm:rounded-2xl"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border-subtle p-5">
            <div className="min-w-0 pr-4">
              <h3
                id={dialogTitleId}
                className="truncate text-lg font-semibold text-text-primary"
              >
                {copy.configureTitle(account.name)}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">
                {copy.configureSubtitle}
              </p>
            </div>
            <button
              type="button"
              aria-label={copy.close}
              onClick={() => !loading && setShowConfigWizard(false)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-text-muted hover:bg-surface-secondary hover:text-text-primary"
              disabled={loading}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <fieldset>
              <legend className="text-base font-semibold text-text-primary">
                {copy.representationQuestion}
              </legend>
              <div className="mt-3 flex flex-col gap-2">
                {REPRESENTATIONS.map((value) => (
                  <label
                    key={value}
                    className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors ${
                      representation === value
                        ? 'border-accent-primary bg-accent-primary/10'
                        : 'border-border-subtle bg-surface-base hover:bg-surface-secondary'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`representation-${account.id}`}
                      value={value}
                      checked={representation === value}
                      onChange={(event) => setRepresentation(event.target.value)}
                      className="h-4 w-4 shrink-0 accent-accent-primary"
                    />
                    <span className="text-base font-medium text-text-primary">
                      {copy.representations[value]}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="shrink-0 border-t border-border-subtle bg-surface-elevated p-5">
            {error ? (
              <p className="mb-3 text-sm font-medium text-semantic-danger" role="alert">
                {error}
              </p>
            ) : null}
            {success ? (
              <div className="flex items-center gap-2 rounded-xl border border-semantic-success/20 bg-semantic-success/10 p-4 text-sm font-medium text-semantic-success">
                <CheckCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span>{copy.success}</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handleSaveCustomConfig()}
                disabled={loading || !representation}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent-primary px-4 text-base font-semibold text-white transition-colors hover:bg-accent-primary/90 disabled:opacity-50"
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                {loading ? copy.saving : copy.save}
              </button>
            )}
          </div>
        </div>
      </div>,
      document.body,
    );
  };

  if (isCanonical) {
    return (
      <div className="mt-2 flex items-center gap-3 rounded-xl border border-accent-primary/20 bg-accent-primary/10 p-3 text-accent-primary">
        {success ? (
          <CheckCircle className="h-5 w-5 shrink-0 text-semantic-success" aria-hidden="true" />
        ) : error ? (
          <AlertCircle className="h-5 w-5 shrink-0 text-semantic-danger" aria-hidden="true" />
        ) : (
          <RefreshCw className="h-5 w-5 shrink-0 animate-spin" aria-hidden="true" />
        )}
        <p className="flex-1 text-sm font-medium text-text-primary">
          {success
            ? copy.ready(account.name)
            : error
              ? copy.preparationFailed(account.name)
              : copy.preparing(account.name)}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-2 rounded-xl border border-semantic-warning/20 bg-semantic-warning/10 p-3">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-semantic-warning" aria-hidden="true" />
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {copy.needsAdjustment(account.name)}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
                {copy.needsAdjustmentBody}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowConfigWizard(true)}
              className="min-h-11 shrink-0 rounded-lg bg-semantic-warning/15 px-4 text-xs font-semibold text-semantic-warning hover:bg-semantic-warning/20"
            >
              {copy.resolveNow}
            </button>
          </div>
        </div>
      </div>
      {renderWizardModal()}
    </>
  );
}
