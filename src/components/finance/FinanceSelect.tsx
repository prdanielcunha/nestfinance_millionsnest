import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { IconButton } from '@/src/components/foundation';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';

export interface FinanceSelectOption {
  value: string;
  label: string;
}

interface FinanceSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: FinanceSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  emptyMessage?: string;
  searchPlaceholder?: string;
  allowClear?: boolean;
}

const UI_COPY: Record<Language, { clear: string; searchOptions: string; close: string }> = {
  PT: { clear: 'Nenhum', searchOptions: 'Buscar opções', close: 'Fechar opções' },
  EN: { clear: 'None', searchOptions: 'Search options', close: 'Close options' },
  ES: { clear: 'Ninguno', searchOptions: 'Buscar opciones', close: 'Cerrar opciones' },
};

export function FinanceSelect({
  value,
  onChange,
  options,
  placeholder = 'Selecione...',
  disabled = false,
  className = '',
  emptyMessage = 'Nenhuma opção',
  searchPlaceholder = 'Buscar...',
  allowClear = false,
}: FinanceSelectProps) {
  const { language } = useLanguage();
  const copy = UI_COPY[language];
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const triggerId = React.useId();
  const listboxId = React.useId();

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const selectedOption = useMemo(() => options.find((option) => option.value === value), [options, value]);

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const normalizedQuery = searchQuery.toLocaleLowerCase();
    return options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery));
  }, [options, searchQuery]);

  const allItems = useMemo(() => {
    const items = [...filteredOptions];
    if (allowClear) items.unshift({ value: '', label: copy.clear });
    return items;
  }, [allowClear, copy.clear, filteredOptions]);

  const showSearch = options.length > 8;

  useEffect(() => {
    if (!isOpen || !triggerRef.current || isMobile) return;

    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const minRequiredSpace = 200;

      const style: React.CSSProperties = {
        left: rect.left,
        width: rect.width,
        position: 'fixed',
      };

      if (spaceBelow < minRequiredSpace && spaceAbove > spaceBelow) {
        style.bottom = window.innerHeight - rect.top + 6;
        style.maxHeight = `${Math.max(160, spaceAbove - 16)}px`;
      } else {
        style.top = rect.bottom + 6;
        style.maxHeight = `${Math.max(160, spaceBelow - 16)}px`;
      }

      setPopoverStyle(style);
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, isMobile]);

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    setIsOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setFocusedIndex((current) => Math.min(current + 1, allItems.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setFocusedIndex((current) => Math.max(current - 1, 0));
      } else if (event.key === 'Enter' && focusedIndex >= 0 && focusedIndex < allItems.length) {
        event.preventDefault();
        handleSelect(allItems[focusedIndex].value);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [allItems, focusedIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setFocusedIndex(-1);
      return;
    }

    setSearchQuery('');
    const initialItems = allowClear ? [{ value: '', label: copy.clear }, ...options] : options;
    const initialIndex = initialItems.findIndex((item) => item.value === value);
    setFocusedIndex(initialIndex >= 0 ? initialIndex : initialItems.length > 0 ? 0 : -1);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
    // Reset only when the popup actually opens/closes; parent option-array recreation must not erase search text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const renderList = () => (
    <>
      {showSearch ? (
        <div className="shrink-0 border-b border-border-subtle p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <input
              type="search"
              className="min-h-12 w-full rounded-xl border border-border-subtle bg-surface-base py-3 pl-9 pr-4 text-base text-text-primary outline-none nf-interactive placeholder:text-text-muted focus:border-accent-primary"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setFocusedIndex(allowClear ? 1 : 0);
              }}
              autoFocus={!isMobile}
              aria-label={copy.searchOptions}
            />
          </div>
        </div>
      ) : null}

      <div
        id={listboxId}
        role="listbox"
        className="min-h-0 flex-1 overflow-y-auto p-2"
        aria-label={placeholder}
      >
        {allItems.length === 0 ? (
          <div className="p-4 text-center text-sm text-text-muted" role="status">
            {emptyMessage}
          </div>
        ) : (
          allItems.map((option, index) => {
            const isSelected = value === option.value;
            const isFocused = focusedIndex === index;
            return (
              <button
                key={`${option.value}-${index}`}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`nf-interactive mb-1 flex min-h-12 w-full items-center justify-between rounded-xl px-3 py-3 text-left ${
                  isSelected
                    ? 'bg-accent-primary/10 font-medium text-accent-primary'
                    : 'text-text-primary hover:bg-surface-secondary'
                } ${isFocused ? 'ring-2 ring-accent-primary ring-inset' : ''}`}
                onClick={() => handleSelect(option.value)}
                onMouseEnter={() => setFocusedIndex(index)}
              >
                <span className="truncate text-base">{option.label}</span>
                {isSelected ? <Check className="h-5 w-5 shrink-0 text-accent-primary" aria-hidden="true" /> : null}
              </button>
            );
          })
        )}
      </div>
    </>
  );

  const renderDropdown = () => {
    if (!isOpen) return null;

    if (isMobile) {
      return createPortal(
        <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={placeholder}>
          <div
            className="absolute inset-0 bg-background-base/80 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div className="nf-glass relative flex max-h-[85vh] w-full flex-col rounded-t-3xl border-x-0 border-b-0 pb-[env(safe-area-inset-bottom,16px)] shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-5 py-3">
              <h3 className="pr-3 text-base font-semibold text-text-primary">{placeholder}</h3>
              <IconButton
                label={copy.close}
                icon={<X className="h-5 w-5" />}
                onClick={() => setIsOpen(false)}
              />
            </div>
            {renderList()}
          </div>
        </div>,
        document.body,
      );
    }

    return createPortal(
      <>
        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} aria-hidden="true" />
        <div
          className="nf-surface-elevated absolute z-50 flex flex-col overflow-hidden rounded-2xl"
          style={popoverStyle}
        >
          {renderList()}
        </div>
      </>,
      document.body,
    );
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (!isOpen && event.key === 'ArrowDown') {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        className={`nf-interactive flex min-h-12 w-full items-center justify-between px-4 text-left outline-none ${
          disabled ? 'cursor-not-allowed opacity-50' : 'focus:border-accent-primary'
        } ${className}`}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={isOpen && focusedIndex >= 0 ? `${listboxId}-option-${focusedIndex}` : undefined}
      >
        <span className={`block truncate text-base ${!selectedOption && !value ? 'text-text-muted' : 'text-text-primary'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`ml-2 h-5 w-5 shrink-0 text-text-muted nf-interactive ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {renderDropdown()}
    </>
  );
}
