import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-text-primary text-background-base border border-text-primary/90 hover:bg-white disabled:bg-text-muted disabled:border-text-muted',
  secondary:
    'bg-surface-elevated text-text-primary border border-border-strong hover:bg-surface-secondary hover:border-border-strong',
  ghost:
    'bg-transparent text-text-secondary border border-transparent hover:bg-surface-secondary hover:text-text-primary',
  danger:
    'bg-semantic-danger/10 text-semantic-danger border border-semantic-danger/20 hover:bg-semantic-danger/15',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 py-2.5 text-sm rounded-xl',
  lg: 'min-h-12 px-5 py-3 text-base rounded-2xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    leadingIcon,
    trailingIcon,
    fullWidth = false,
    className = '',
    children,
    type = 'button',
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={`nf-interactive press-fx inline-flex items-center justify-center gap-2 font-semibold select-none disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {leadingIcon ? <span className="shrink-0" aria-hidden="true">{leadingIcon}</span> : null}
      {children ? <span className="min-w-0">{children}</span> : null}
      {trailingIcon ? <span className="shrink-0" aria-hidden="true">{trailingIcon}</span> : null}
    </button>
  );
});
