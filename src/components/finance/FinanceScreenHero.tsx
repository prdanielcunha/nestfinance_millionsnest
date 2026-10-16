import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = {
  title: string;
  subtitle: string;
  backLabel?: string;
  onBack?: () => void;
  children?: ReactNode;
};

/**
 * The navy-and-gold screen header from the NestFinance six-screen reference.
 * Uses real page titles/actions; it is not a mockup, bitmap or source of data.
 */
export function FinanceScreenHero({ title, subtitle, backLabel, onBack, children }: Props) {
  return (
    <header className="nf-design-hero rounded-t-[1.5rem] sm:rounded-t-[1.75rem]">
      <div className="relative z-[3] mx-auto flex max-w-5xl items-start gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel || title}
            className="nf-interactive mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/20 text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#f0ca8b]"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1 pt-1">
          <h1 className="text-[1.65rem] font-semibold leading-tight tracking-tight text-white sm:text-[2rem]">{title}</h1>
          <p className="mt-2 max-w-3xl text-base leading-relaxed text-[#dce7e4]">{subtitle}</p>
          {children ? <div className="mt-5">{children}</div> : null}
        </div>
      </div>
    </header>
  );
}
