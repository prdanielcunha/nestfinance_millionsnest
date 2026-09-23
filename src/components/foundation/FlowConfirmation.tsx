import type { ReactNode } from 'react';
import { Button } from './Button';

export interface FlowConfirmationProps {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  disabled?: boolean;
}

export function FlowConfirmation({
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy = false,
  disabled = false,
}: FlowConfirmationProps) {
  return (
    <section
      aria-labelledby="flow-confirmation-title"
      className="rounded-2xl border border-border-subtle bg-surface-elevated p-5"
    >
      <h2 id="flow-confirmation-title" className="text-xl font-semibold text-text-primary">
        {title}
      </h2>
      {description ? <div className="mt-2 leading-relaxed text-text-secondary">{description}</div> : null}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Button variant="secondary" fullWidth onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button variant="primary" fullWidth onClick={onConfirm} disabled={busy || disabled}>
          {confirmLabel}
        </Button>
      </div>
    </section>
  );
}
