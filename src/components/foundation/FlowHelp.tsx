import { useId, useState, type ReactNode } from 'react';

export interface FlowHelpProps {
  title: string;
  children: ReactNode;
  openLabel?: string;
  closeLabel?: string;
}

export function FlowHelp({
  title,
  children,
  openLabel = 'Preciso de ajuda',
  closeLabel = 'Fechar ajuda',
}: FlowHelpProps) {
  const [open, setOpen] = useState(false);
  const contentId = useId();

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-secondary/60 p-4">
      <button
        type="button"
        className="nf-interactive min-h-[3.25rem] w-full rounded-xl px-3 text-left font-semibold text-text-primary"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? closeLabel : openLabel}
      </button>
      {open ? (
        <div id={contentId} className="mt-3 border-t border-border-subtle pt-3">
          <p className="font-semibold text-text-primary">{title}</p>
          <div className="mt-2 leading-relaxed text-text-secondary">{children}</div>
        </div>
      ) : null}
    </div>
  );
}
