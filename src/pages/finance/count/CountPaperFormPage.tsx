import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Printer, ShieldX } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button, Surface } from '@/src/components/foundation';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import { countPaperService } from '@/src/services/countPaperService';
import {
  COUNT_PAPER_QR_SIZE,
  createCountPaperQrMatrix,
  isValidCountPaperFormId,
  type CountPaperFormDetail,
} from '@/shared/finance/countPaper';
import { COUNT_DENOMINATIONS_CENTS } from '@/shared/finance/count';
import { COUNT_PAPER_COPY } from './countPaperCopy';
import { formatReviewDate, formatReviewMoney } from '../transactions/transactionReviewModel';

const PRINT_STYLES = `
@page { size: A4 portrait; margin: 8mm; }
@media print {
  html, body { background: #fff !important; }
  body * { visibility: hidden !important; }
  .count-paper-print, .count-paper-print * { visibility: visible !important; }
  .count-paper-print {
    position: absolute !important;
    inset: 0 !important;
    width: 194mm !important;
    min-height: 281mm !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    color: #000 !important;
    box-shadow: none !important;
    border: 0 !important;
  }
  .count-paper-print * {
    color: #000 !important;
    border-color: #000 !important;
    background: #fff !important;
    box-shadow: none !important;
  }
  .count-paper-screen-only { display: none !important; }
  .count-paper-section { break-inside: avoid; }
}
`;

function QrSvg({ payload, label }: { payload: string; label: string }) {
  const matrix = useMemo(() => createCountPaperQrMatrix(payload), [payload]);
  const quiet = 4;
  const size = COUNT_PAPER_QR_SIZE + quiet * 2;
  const path = useMemo(() => {
    const commands: string[] = [];
    matrix.forEach((row, rowIndex) => {
      row.forEach((dark, columnIndex) => {
        if (dark) commands.push(`M${columnIndex + quiet} ${rowIndex + quiet}h1v1h-1z`);
      });
    });
    return commands.join('');
  }, [matrix]);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className="h-32 w-32 shrink-0 bg-white sm:h-36 sm:w-36"
    >
      <rect width={size} height={size} fill="white" />
      <path d={path} fill="black" />
    </svg>
  );
}

export default function CountPaperFormPage() {
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const screenCopy = COUNT_PAPER_COPY[language];

  if (accessState.status === 'initializing' || accessState.status === 'authenticated_unresolved') return null;
  if (!hasEffectiveCapability(accessState, 'finance.view')) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center bg-surface-base p-8 text-center">
        <ShieldX className="h-10 w-10 text-semantic-danger" aria-hidden="true" />
        <h1 className="mt-4 text-lg font-semibold text-text-primary">{screenCopy.accessDeniedTitle}</h1>
        <p className="mt-2 max-w-sm text-sm text-text-muted">{screenCopy.accessDeniedBody}</p>
      </main>
    );
  }

  return (
    <FinanceContextGuard>
      <CountPaperFormContent />
    </FinanceContextGuard>
  );
}

function CountPaperFormContent() {
  const navigate = useNavigate();
  const { formId = '' } = useParams();
  const { accessState } = useAuth();
  const { activeFinanceEntityId } = useFinanceEntity();
  const { language } = useLanguage();
  const screenCopy = COUNT_PAPER_COPY[language];
  const organizationId = accessState.organizationId || accessState.organization?.id || '';
  const [form, setForm] = useState<CountPaperFormDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const epochRef = useRef(0);

  const load = async (epoch = ++epochRef.current) => {
    if (!organizationId || !activeFinanceEntityId || !isValidCountPaperFormId(formId)) {
      setLoading(false);
      setError(true);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const response = await countPaperService.detail(organizationId, activeFinanceEntityId, formId);
      if (epoch !== epochRef.current) return;
      setForm(response.form);
    } catch {
      if (epoch !== epochRef.current) return;
      setError(true);
      setForm(null);
    } finally {
      if (epoch === epochRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const epoch = ++epochRef.current;
    setForm(null);
    void load(epoch);
    // The form lookup is scoped by canonical organization/entity context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, activeFinanceEntityId, formId]);

  if (loading) {
    return <div className="flex flex-1 items-center justify-center bg-surface-base p-8 text-sm text-text-muted" aria-busy="true">{screenCopy.loading}</div>;
  }

  if (error || !form) {
    return (
      <div className="flex flex-1 items-center justify-center bg-surface-base p-4">
        <Surface variant="elevated" radius="xl" className="w-full max-w-md p-6 text-center" role="alert">
          <p className="text-sm text-text-muted">{screenCopy.safeError}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Button variant="secondary" fullWidth onClick={() => navigate(APP_ROUTES.countPaperForms)}>{screenCopy.back}</Button>
            <Button fullWidth onClick={() => void load()}>{screenCopy.retry}</Button>
          </div>
        </Surface>
      </div>
    );
  }

  const copy = COUNT_PAPER_COPY[form.locale];
  const denominationLabels = COUNT_DENOMINATIONS_CENTS.map((value) => formatReviewMoney(value, form.locale, 'BRL'));

  return (
    <div className="min-h-full flex-1 bg-surface-base px-4 py-5 sm:px-6 lg:px-8">
      <style>{PRINT_STYLES}</style>
      <div className="count-paper-screen-only mx-auto mb-5 flex w-full max-w-5xl items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => navigate(APP_ROUTES.countPaperForms)}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {screenCopy.back}
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden="true" />
          {screenCopy.print}
        </Button>
      </div>

      <article className="count-paper-print mx-auto w-full max-w-[194mm] bg-white p-5 text-black shadow-lg sm:p-8">
        <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.14em]">NestFinance · Count</p>
            <h1 className="mt-2 text-2xl font-bold">{copy.formTitle}</h1>
            <p className="mt-1 text-lg font-semibold">{copy.stageLabel[form.stage]}</p>
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <p><strong>{copy.service}:</strong> {form.serviceLabel}</p>
              <p><strong>{copy.date}:</strong> {formatReviewDate(`${form.serviceDate}T12:00:00.000Z`, form.locale)}</p>
              <p className="sm:col-span-2"><strong>{copy.reference}:</strong> <span className="font-mono">{form.formId}</span> · v{form.templateVersion}</p>
            </div>
          </div>
          <div className="text-center">
            <QrSvg payload={form.qrPayload} label={`${copy.reference}: ${form.formId}`} />
            <p className="mt-1 font-mono text-[9px]">{form.checksum}</p>
          </div>
        </header>

        <section className="count-paper-section mt-4 border border-black p-3">
          <h2 className="text-sm font-bold uppercase tracking-wide">{copy.instructionsTitle}</h2>
          <p className="mt-1 text-[11px] leading-relaxed">{copy.instructionsBody}</p>
        </section>

        <section className="count-paper-section mt-4">
          <div className="grid grid-cols-4 border border-black text-center text-sm font-bold">
            {[copy.tithes, copy.offerings, copy.otherIncome, copy.pix].map((label) => (
              <div key={label} className="border-r border-black p-2 last:border-r-0">
                <p>{label}</p>
                <div className="mt-3 h-8 border-b border-black" />
                <p className="mt-1 text-[10px] font-normal">{copy.total}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="count-paper-section mt-4">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">{copy.denominationTitle}</h2>
          <div className="grid grid-cols-[1.1fr_1fr_1fr_1fr] border border-black text-[10px]">
            <div className="border-b border-r border-black p-2 font-bold">{copy.denomination}</div>
            <div className="border-b border-r border-black p-2 text-center font-bold">{copy.tithes} · {copy.quantity}</div>
            <div className="border-b border-r border-black p-2 text-center font-bold">{copy.offerings} · {copy.quantity}</div>
            <div className="border-b border-black p-2 text-center font-bold">{copy.otherIncome} · {copy.quantity}</div>
            {denominationLabels.map((label) => (
              <div key={label} className="contents">
                <div className="border-b border-r border-black p-1.5 font-semibold">{label}</div>
                <div className="border-b border-r border-black" />
                <div className="border-b border-r border-black" />
                <div className="border-b border-black" />
              </div>
            ))}
          </div>
        </section>

        <section className="count-paper-section mt-4 grid grid-cols-4 border border-black text-sm">
          <div className="border-r border-black p-2 font-bold">{copy.finalTotals}</div>
          <div className="border-r border-black p-2"><span className="text-[10px]">{copy.tithes}</span><div className="mt-3 border-b border-black" /></div>
          <div className="border-r border-black p-2"><span className="text-[10px]">{copy.offerings}</span><div className="mt-3 border-b border-black" /></div>
          <div className="p-2"><span className="text-[10px]">{copy.otherIncome} + {copy.pix}</span><div className="mt-3 border-b border-black" /></div>
        </section>

        <section className="count-paper-section mt-4 grid gap-4 sm:grid-cols-2">
          {[copy.counter, copy.checker].map((label) => (
            <div key={label} className="border border-black p-3 text-xs">
              <p className="font-bold">{label}</p>
              <div className="mt-5 border-b border-black" />
              <p className="mt-1">{copy.signature}</p>
              <div className="mt-4 border-b border-black" />
              <p className="mt-1">{copy.time}</p>
            </div>
          ))}
        </section>

        <footer className="count-paper-section mt-4 border-t border-black pt-3 text-[9px] leading-relaxed">
          <p>{copy.qrNote}</p>
          <p className="mt-1 font-semibold">{copy.noPosting}</p>
        </footer>
      </article>
    </div>
  );
}
