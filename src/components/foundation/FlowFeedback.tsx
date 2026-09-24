import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';

export type FlowFeedbackTone = 'success' | 'error' | 'warning' | 'info';

export interface FlowFeedbackProps {
  tone: FlowFeedbackTone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  assertive?: boolean;
  className?: string;
}

const META: Record<FlowFeedbackTone, {
  icon: typeof CheckCircle2;
  classes: string;
  iconClass: string;
}> = {
  success: {
    icon: CheckCircle2,
    classes: 'border-semantic-success/20 bg-semantic-success/10',
    iconClass: 'text-semantic-success',
  },
  error: {
    icon: AlertCircle,
    classes: 'border-semantic-danger/20 bg-semantic-danger/10',
    iconClass: 'text-semantic-danger',
  },
  warning: {
    icon: TriangleAlert,
    classes: 'border-semantic-warning/20 bg-semantic-warning/10',
    iconClass: 'text-semantic-warning',
  },
  info: {
    icon: Info,
    classes: 'border-accent-primary/20 bg-accent-primary/10',
    iconClass: 'text-accent-primary',
  },
};

export function FlowFeedback({
  tone,
  title,
  children,
  action,
  assertive = tone === 'error',
  className = '',
}: FlowFeedbackProps) {
  const meta = META[tone];
  const Icon = meta.icon;

  return (
    <div
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={`rounded-2xl border p-4 ${meta.classes} ${className}`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${meta.iconClass}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-text-primary">{title}</p>
          {children ? <div className="mt-1 leading-relaxed text-text-secondary">{children}</div> : null}
        </div>
      </div>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
