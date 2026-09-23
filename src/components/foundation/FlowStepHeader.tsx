import type { ReactNode } from 'react';

export interface FlowStepHeaderProps {
  currentStep: number;
  totalSteps: number;
  title: string;
  stepLabel: string;
  description?: string;
  eyebrow?: string;
  trailing?: ReactNode;
}

export function FlowStepHeader({
  currentStep,
  totalSteps,
  title,
  stepLabel,
  description,
  eyebrow,
  trailing,
}: FlowStepHeaderProps) {
  const safeTotal = Math.max(1, totalSteps);
  const safeCurrent = Math.min(Math.max(1, currentStep), safeTotal);

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="nf-helper-text font-semibold uppercase tracking-[0.14em] text-accent-primary">
          {eyebrow ? `${eyebrow} · ` : ''}{stepLabel}
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          {title}
        </h2>
        <div
          className="mt-3 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-surface-secondary"
          role="progressbar"
          aria-label={stepLabel}
          aria-valuemin={1}
          aria-valuemax={safeTotal}
          aria-valuenow={safeCurrent}
        >
          <div
            className="h-full rounded-full bg-accent-primary"
            style={{ width: `${(safeCurrent / safeTotal) * 100}%` }}
            aria-hidden="true"
          />
        </div>
        {description ? (
          <p className="mt-3 max-w-2xl leading-relaxed text-text-secondary">{description}</p>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </header>
  );
}
