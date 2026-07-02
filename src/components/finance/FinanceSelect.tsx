import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, Check, X } from 'lucide-react';
import { createPortal } from 'react-dom';

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
  className?: string; // Classes for the trigger
  emptyMessage?: string;
  searchPlaceholder?: string;
  allowClear?: boolean;
}

export function FinanceSelect({
  value,
  onChange,
  options,
  placeholder = 'Selecione...',
  disabled = false,
  className = '',
  emptyMessage = 'Nenhuma opção',
  searchPlaceholder = 'Buscar...',
  allowClear = false
}: FinanceSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  
  // Track window width for mobile vs desktop logic
  const [isMobile, setIsMobile] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const triggerId = React.useId();
  const listboxId = React.useId();
  
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const selectedOption = useMemo(() => options.find(o => o.value === value), [options, value]);

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const lowerQuery = searchQuery.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(lowerQuery));
  }, [options, searchQuery]);

  const allItems = useMemo(() => {
    const items = [...filteredOptions];
    if (allowClear) {
      items.unshift({ value: '', label: 'Nenhum' });
    }
    return items;
  }, [filteredOptions, allowClear]);

  const showSearch = options.length > 8;

  // Position logic for desktop popover
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  
  useEffect(() => {
    if (isOpen && triggerRef.current && !isMobile) {
      const updatePosition = () => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const popoverMaxHeight = 320;
        
        let style: React.CSSProperties = {
          left: rect.left,
          width: rect.width,
          position: 'fixed',
        };

        if (spaceBelow < popoverMaxHeight && spaceAbove > spaceBelow) {
          // Open upwards
          const maxHeight = Math.min(popoverMaxHeight, spaceAbove - 12);
          style.bottom = window.innerHeight - rect.top + 4;
          style.maxHeight = `${maxHeight}px`;
        } else {
          // Open downwards
          const maxHeight = Math.min(popoverMaxHeight, spaceBelow - 12);
          style.top = rect.bottom + 4;
          style.maxHeight = `${maxHeight}px`;
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
    }
  }, [isOpen, isMobile]);

  // Click outside and escape handler
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex(prev => (prev < allItems.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex(prev => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === 'Enter') {
        if (focusedIndex >= 0 && focusedIndex < allItems.length) {
          e.preventDefault();
          handleSelect(allItems[focusedIndex].value);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, allItems, focusedIndex]);

  // Reset search and focus when opening
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      const initialIndex = allItems.findIndex(i => i.value === value);
      setFocusedIndex(initialIndex >= 0 ? initialIndex : 0);
      // Prevent body scroll on mobile
      if (isMobile) {
        document.body.style.overflow = 'hidden';
      }
    } else {
      document.body.style.overflow = '';
      setFocusedIndex(-1);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, isMobile]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const renderList = () => (
    <>
      {showSearch && (
        <div className="p-4 border-b border-border-subtle shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              className="w-full bg-surface-base border border-border-subtle text-text-primary rounded-xl pl-9 pr-4 py-3 outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-colors text-base"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus={!isMobile} // autoFocus on desktop, can be tricky on mobile so omit
              aria-label="Buscar opções"
            />
          </div>
        </div>
      )}
      
      <div 
        id={listboxId}
        role="listbox"
        className="flex-1 overflow-y-auto p-2 min-h-0 overscroll-contain"
        aria-label={placeholder}
      >
        {filteredOptions.length === 0 && (!allowClear || value !== '') ? (
          <div className="p-4 text-center text-text-muted text-sm" role="option" aria-selected="false">
            {emptyMessage}
          </div>
        ) : (
          allItems.map((opt, idx) => {
            const isSelected = value === opt.value;
            const isFocused = focusedIndex === idx;
            return (
              <button
                key={opt.value}
                id={`${listboxId}-option-${idx}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`w-full flex items-center justify-between px-3 py-3 rounded-xl text-left transition-colors mb-1
                  ${isSelected ? 'bg-accent-primary/10 text-accent-primary font-medium' : 'text-text-primary hover:bg-surface-secondary'}
                  ${isFocused ? 'ring-2 ring-accent-primary ring-inset' : ''}
                `}
                onClick={() => handleSelect(opt.value)}
                onMouseEnter={() => setFocusedIndex(idx)}
              >
                <span className="text-base truncate">{opt.label}</span>
                {isSelected && <Check className="w-5 h-5 shrink-0 text-accent-primary" />}
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
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div 
            className="absolute inset-0 bg-background-base/80 backdrop-blur-sm transition-opacity"
            onClick={() => setIsOpen(false)}
          />
          <div className="relative bg-surface-elevated rounded-t-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border-t border-border-subtle pb-[env(safe-area-inset-bottom,16px)]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
              <h3 className="text-base font-medium text-text-primary">{placeholder}</h3>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 -mr-2 text-text-muted hover:text-text-primary hover:bg-surface-secondary rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderList()}
          </div>
        </div>,
        document.body
      );
    }

    // Desktop
    return createPortal(
      <>
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsOpen(false)} 
        />
        <div 
          className="absolute z-50 bg-surface-elevated border border-border-subtle rounded-xl shadow-xl overflow-hidden flex flex-col"
          style={popoverStyle}
        >
          {renderList()}
        </div>
      </>,
      document.body
    );
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        className={`w-full flex items-center justify-between px-4 text-left outline-none transition-colors 
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'focus:border-accent-primary focus:ring-1 focus:ring-accent-primary'}
          ${className}
        `}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={isOpen && focusedIndex >= 0 ? `${listboxId}-option-${focusedIndex}` : undefined}
      >
        <span className={`block truncate text-base ${!selectedOption && !value ? 'text-text-muted' : 'text-text-primary'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className="w-5 h-5 text-text-muted shrink-0 ml-2" />
      </button>
      {renderDropdown()}
    </>
  );
}
