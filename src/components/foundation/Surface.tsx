import { forwardRef, type HTMLAttributes } from 'react';

export type SurfaceVariant = 'default' | 'secondary' | 'elevated' | 'glass';
export type SurfaceRadius = 'md' | 'lg' | 'xl';

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SurfaceVariant;
  radius?: SurfaceRadius;
}

const VARIANT_CLASSES: Record<SurfaceVariant, string> = {
  default: 'bg-surface-default border border-border-subtle',
  secondary: 'bg-surface-secondary border border-border-subtle',
  elevated: 'nf-surface-elevated',
  glass: 'nf-glass',
};

const RADIUS_CLASSES: Record<SurfaceRadius, string> = {
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  xl: 'rounded-3xl',
};

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  { variant = 'default', radius = 'lg', className = '', ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={`${VARIANT_CLASSES[variant]} ${RADIUS_CLASSES[radius]} ${className}`}
      {...props}
    />
  );
});
