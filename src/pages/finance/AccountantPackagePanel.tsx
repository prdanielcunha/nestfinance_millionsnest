import { useState } from 'react';
import { Download, FileArchive, RefreshCw, ShieldCheck } from 'lucide-react';
import type { AccountantPackageLayout } from '../../../shared/finance/accountantPackage';
import { Button, FlowFeedback, Surface } from '@/src/components/foundation';
import { FinanceSelect } from '@/src/components/finance/FinanceSelect';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';
import {
  accountantPackageService,
  downloadAccountantPackageFile,
  type AccountantPackageResponse,
} from '@/src/services/accountantPackageService';

type Profile = 'complete' | 'essential' | 'reconciliation';

const PROFILE_LAYOUTS: Record<Profile, Partial<AccountantPackageLayout>> = {
  complete: {},
  essential: {
    transactionColumns: [
      'transactionId',
      'occurredAt',
      'competenceDate',
      'transactionKind',
      'status',
      'amount',
      'counterparty',
      'description',
      'account',
      'reconciliationStatus',
      'evidenceIds',
    ],
    evidenceColumns: [
      'evidenceId',
      'createdAt',
      'filename',
      'documentType',
      'reviewStatus',
      'linkedTransactionIds',
    ],
    pendingColumns: [
      'transactionId',
      'occurredAt',
      'status',
      'amount',
      'counterparty',
      'justification',
      'reconciliationStatus',
    ],
  },
  reconciliation: {
    transactionColumns: [
      'transactionId',
      'occurredAt',
      'transactionKind',
      'status',
      'amount',
      'account',
      'paymentMethod',
      'reconciliationStatus',
      'evidenceIds',
      'justification',
    ],
    evidenceColumns: [
      'evidenceId',
      'createdAt',
      'filename',
      'documentType',
      'reviewStatus',
      'linkedTransactionIds',
    ],
    pendingColumns: [
      'transactionId',
      'occurredAt',
      'status',
      'amount',
      'justification',
      'reconciliationStatus',
      'evidenceCount',
    ],
  },
};

const COPY: Record<Language, {
  title: string;
  body: string;
  profile: string;
  profileGuidance: string;
  complete: string;
  completeDescription: string;
  essential: string;
  essentialDescription: string;
  reconciliation: string;
  reconciliationDescription: string;
  generate: string;
  generating: string;
  error: string;
  ready: string;
  readyBody: string;
  download: string;
  downloadAll: string;
  authority: string;
  authorityBody: string;
}> = {
  PT: {
    title: 'Pacote mensal para o contador',
    body: 'Gere CSVs das movimentações, índice de comprovantes, pendências e conciliação do mês. O formato não depende de integração paga.',
    profile: 'Formato do pacote',
    profileGuidance: 'Escolha pelo objetivo do contador. O formato muda somente quais colunas são exportadas; não altera nenhum dado financeiro.',
    complete: 'Completo',
    completeDescription: 'Leva o conjunto mais amplo de campos, comprovantes e pendências. Use quando o contador quer máxima rastreabilidade.',
    essential: 'Essencial',
    essentialDescription: 'Mantém os dados principais para conferência mensal e reduz colunas técnicas que normalmente não são necessárias.',
    reconciliation: 'Foco em conciliação',
    reconciliationDescription: 'Prioriza conta, forma de pagamento, evidências, diferenças e estado da conferência com o banco.',
    generate: 'Gerar pacote',
    generating: 'Gerando pacote…',
    error: 'Não foi possível gerar o pacote. Nenhum dado financeiro foi alterado.',
    ready: 'Pacote pronto',
    readyBody: 'Baixe os arquivos abaixo e envie ao contador pelo canal que vocês já utilizam.',
    download: 'Baixar',
    downloadAll: 'Baixar todos',
    authority: 'Exportação operacional, não certificação',
    authorityBody: 'O pacote não certifica escrituração, obrigações fiscais, postagem ou fechamento oficial. A certificação de postagem continua sendo uma etapa separada.',
  },
  EN: {
    title: 'Monthly accountant package',
    body: 'Generate monthly transaction CSVs, evidence index, pending items, and reconciliation status without a paid integration.',
    profile: 'Package format',
    profileGuidance: 'Choose based on the accountant’s goal. The format changes exported columns only; it does not change financial data.',
    complete: 'Complete',
    completeDescription: 'Exports the broadest set of fields, evidence, and pending items. Use when the accountant needs maximum traceability.',
    essential: 'Essential',
    essentialDescription: 'Keeps the main monthly review data while removing technical columns that are usually unnecessary.',
    reconciliation: 'Reconciliation focus',
    reconciliationDescription: 'Prioritizes account, payment method, evidence, differences, and bank-check status.',
    generate: 'Generate package',
    generating: 'Generating package…',
    error: 'The package could not be generated. No financial data was changed.',
    ready: 'Package ready',
    readyBody: 'Download the files below and send them to the accountant through your existing channel.',
    download: 'Download',
    downloadAll: 'Download all',
    authority: 'Operational export, not certification',
    authorityBody: 'This package does not certify accounting books, tax compliance, posting, or official close. Posting certification remains a separate stage.',
  },
  ES: {
    title: 'Paquete mensual para el contador',
    body: 'Genere CSV de movimientos, índice de comprobantes, pendientes y conciliación del mes sin una integración pagada.',
    profile: 'Formato del paquete',
    profileGuidance: 'Elige según el objetivo del contador. El formato solo cambia las columnas exportadas; no modifica ningún dato financiero.',
    complete: 'Completo',
    completeDescription: 'Exporta el conjunto más amplio de campos, comprobantes y pendientes. Úsalo cuando el contador necesita máxima trazabilidad.',
    essential: 'Esencial',
    essentialDescription: 'Mantiene los datos principales para la revisión mensual y reduce columnas técnicas que normalmente no son necesarias.',
    reconciliation: 'Enfoque en conciliación',
    reconciliationDescription: 'Prioriza cuenta, forma de pago, comprobantes, diferencias y estado de la revisión con el banco.',
    generate: 'Generar paquete',
    generating: 'Generando paquete…',
    error: 'No fue posible generar el paquete. Ningún dato financiero fue modificado.',
    ready: 'Paquete listo',
    readyBody: 'Descargue los archivos y envíelos al contador por el canal que ya utilizan.',
    download: 'Descargar',
    downloadAll: 'Descargar todos',
    authority: 'Exportación operativa, no certificación',
    authorityBody: 'El paquete no certifica libros contables, obligaciones fiscales, contabilización ni cierre oficial. La certificación de contabilización sigue siendo una etapa separada.',
  },
};

export function AccountantPackagePanel({
  organizationId,
  financeEntityId,
  period,
}: {
  organizationId: string;
  financeEntityId: string;
  period: string;
}) {
  const { language } = useLanguage();
  const copy = COPY[language];
  const [profile, setProfile] = useState<Profile>('complete');
  const [result, setResult] = useState<AccountantPackageResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [failed, setFailed] = useState(false);

  const generate = async () => {
    if (!organizationId || !financeEntityId || !period || generating) return;
    setGenerating(true);
    setFailed(false);
    setResult(null);
    try {
      setResult(
        await accountantPackageService.generate(
          organizationId,
          financeEntityId,
          period,
          PROFILE_LAYOUTS[profile],
        ),
      );
    } catch {
      setFailed(true);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Surface variant="elevated" radius="xl" className="p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-primary/10 text-accent-primary">
          <FileArchive className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-text-primary">{copy.title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-text-muted">{copy.body}</p>
        </div>
      </div>

      <div className="mt-5 sm:max-w-md">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
          {copy.profile}
        </label>
        <FinanceSelect
          value={profile}
          onChange={(value) => {
            setProfile(value as Profile);
            setResult(null);
            setFailed(false);
          }}
          options={[
            { value: 'complete', label: copy.complete, description: copy.completeDescription },
            { value: 'essential', label: copy.essential, description: copy.essentialDescription },
            { value: 'reconciliation', label: copy.reconciliation, description: copy.reconciliationDescription },
          ]}
          placeholder={copy.profile}
          guidance={copy.profileGuidance}
        />
      </div>

      <Button className="mt-4 w-full sm:w-auto" size="lg" disabled={generating} onClick={() => void generate()}>
        {generating ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileArchive className="h-4 w-4" aria-hidden="true" />}
        {generating ? copy.generating : copy.generate}
      </Button>

      {failed ? (
        <FlowFeedback className="mt-4" tone="error" title={copy.error} />
      ) : null}

      {result ? (
        <div className="mt-5">
          <FlowFeedback tone="success" title={copy.ready}>
            <p className="text-sm">{copy.readyBody}</p>
          </FlowFeedback>
          <div className="mt-4 flex flex-col gap-2">
            {result.files.map((file) => (
              <div key={file.filename} className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-secondary/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="break-all text-sm font-medium text-text-primary">{file.filename}</span>
                <Button variant="secondary" onClick={() => downloadAccountantPackageFile(file)}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {copy.download}
                </Button>
              </div>
            ))}
          </div>
          <Button
            className="mt-3 w-full sm:w-auto"
            variant="secondary"
            onClick={() => result.files.forEach(downloadAccountantPackageFile)}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {copy.downloadAll}
          </Button>
        </div>
      ) : null}

      <div className="mt-5 flex gap-3 rounded-xl border border-accent-primary/15 bg-accent-primary/5 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-text-primary">{copy.authority}</p>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">{copy.authorityBody}</p>
        </div>
      </div>
    </Surface>
  );
}
