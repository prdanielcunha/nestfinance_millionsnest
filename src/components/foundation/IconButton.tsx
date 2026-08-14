import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type IconButtonVariant = 'default' | 'ghost' | 'accent' | 'danger';
export type IconButtonSize = 'md' | 'lg';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
}

const VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  default: 'bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary hover:bg-surface-secondary',
  ghost: 'bg-transparent text-text-muted border-transparent hover:text-text-primary hover:bg-surface-secondary',
  accent: 'bg-accent-primary/10 text-accent-primary border-accent-primary/20 hover:bg-accent-primary/15',
  danger: 'bg-semantic-danger/10 text-semantic-danger border-semantic-danger/20 hover:bg-semantic-danger/15',
};

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  md: 'h-11 w-11 rounded-xl',
  lg: 'h-12 w-12 rounded-2xl',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    icon,
    variant = 'ghost',
    size = 'md',
    className = '',
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
      aria-label={label}
      title={props.title ?? label}
      disabled={disabled}
      className={`nf-interactive press-fx inline-flex shrink-0 items-center justify-center border select-none disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  );
});
