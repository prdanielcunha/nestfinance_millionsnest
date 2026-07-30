import React from 'react';
import { nestFinanceBrand } from '../../brand/nestFinanceBrand';

type NestFinanceLogoProps = {
  surface?: 'dark' | 'light';
  layout?: 'horizontal' | 'vertical' | 'symbol';
  tagline?: boolean;
  compact?: boolean;
  width?: number | string;
  className?: string;
  priority?: boolean;
};

export function NestFinanceLogo({
  surface = 'dark',
  layout = 'horizontal',
  tagline = true,
  compact = false,
  width,
  className = '',
  priority = false,
}: NestFinanceLogoProps) {
  let src = '';
  let alt = 'NestFinance';
  
  if (layout === 'symbol') {
    src = nestFinanceBrand.symbols.gradient;
    alt = 'Símbolo NestFinance';
  } else if (layout === 'vertical') {
    src = surface === 'dark' 
      ? nestFinanceBrand.logos.dark.vertical 
      : nestFinanceBrand.logos.light.vertical;
  } else {
    // horizontal
    if (tagline && !compact) {
      src = surface === 'dark'
        ? nestFinanceBrand.logos.dark.horizontal
        : nestFinanceBrand.logos.light.horizontal;
    } else {
      src = surface === 'dark'
        ? nestFinanceBrand.logos.dark.horizontalCompact
        : nestFinanceBrand.logos.light.horizontalCompact;
    }
  }

  return (
    <img
      src={src}
      alt={alt}
      width={width}
      className={`block ${className}`}
      loading={priority ? 'eager' : 'lazy'}
      {...(priority ? { fetchPriority: 'high' } : {})}
    />
  );
}
