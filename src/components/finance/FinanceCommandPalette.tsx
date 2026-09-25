import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Search, CornerDownLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  filterFinancePaletteCommands,
  moveFinancePaletteSelection,
  type FinancePaletteCommand,
} from '@/src/lib/financeCommandPaletteModel';

type Copy = {
  title: string;
  placeholder: string;
  empty: string;
  navigation: string;
  actions: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  commands: FinancePaletteCommand[];
  copy: Copy;
};

export function FinanceCommandPalette({ open, onClose, commands, copy }: Props) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredCommands = useMemo(
    () => filterFinancePaletteCommands(commands, query),
    [commands, query],
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (activeIndex >= filteredCommands.length) {
      setActiveIndex(filteredCommands.length > 0 ? 0 : -1);
    }
  }, [activeIndex, filteredCommands.length]);

  if (!open) return null;

  const choose = (command: FinancePaletteCommand) => {
    onClose();
    navigate(command.route);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) =>
        moveFinancePaletteSelection(current, filteredCommands.length, 1),
      );
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) =>
        moveFinancePaletteSelection(current, filteredCommands.length, -1),
      );
      return;
    }

    if (event.key === 'Enter' && activeIndex >= 0) {
      const command = filteredCommands[activeIndex];
      if (command) {
        event.preventDefault();
        choose(command);
      }
    }
  };

  const navigation = filteredCommands.filter((command) => command.kind === 'navigation');
  const actions = filteredCommands.filter((command) => command.kind === 'action');
  let renderedIndex = 0;

  const renderGroup = (label: string, items: FinancePaletteCommand[]) => {
    if (items.length === 0) return null;

    return (
      <div>
        <p className="px-3 pb-2 pt-3 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
          {label}
        </p>
        <div className="space-y-1">
          {items.map((command) => {
            const index = renderedIndex++;
            const selected = index === activeIndex;
            return (
              <button
                key={command.id}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(command)}
                className={`nf-interactive flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-left text-sm font-medium ${
                  selected
                    ? 'bg-surface-elevated text-text-primary'
                    : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
                }`}
              >
                <span className="truncate">{command.label}</span>
                {selected ? (
                  <CornerDownLeft className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-background-base/75 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
        className="w-full max-w-xl overflow-hidden rounded-[24px] border border-border-subtle bg-surface-default shadow-[var(--nf-shadow-floating)]"
      >
        <div className="flex items-center gap-3 border-b border-border-subtle px-4">
          <Search className="h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="finance-command-palette-results"
            aria-autocomplete="list"
            placeholder={copy.placeholder}
            className="h-14 w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
          <kbd className="hidden rounded-lg border border-border-subtle bg-surface-secondary px-2 py-1 text-xs font-semibold text-text-muted sm:inline">
            ESC
          </kbd>
        </div>

        <div
          id="finance-command-palette-results"
          role="listbox"
          className="max-h-[min(60vh,32rem)] overflow-y-auto p-2"
        >
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-text-secondary">
              {copy.empty}
            </div>
          ) : (
            <>
              {renderGroup(copy.navigation, navigation)}
              {renderGroup(copy.actions, actions)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
