import React, { createContext, useContext, useState, ReactNode } from 'react';

interface FinanceEntityContextType {
  activeFinanceEntityId: string | null;
  activeFinanceEntityName: string | null;
  lastUsedFinanceEntityId: string | null;
  setActiveFinanceEntityId: (id: string | null, name?: string) => void;
}

const FinanceEntityContext = createContext<FinanceEntityContextType | undefined>(undefined);

export function FinanceEntityProvider({ children }: { children: ReactNode }) {
  const [activeFinanceEntityId, setActiveFinanceEntityIdState] = useState<string | null>(
    sessionStorage.getItem('nestfinance_active_finance_entity_id') || null
  );
  const [activeFinanceEntityName, setActiveFinanceEntityNameState] = useState<string | null>(
    sessionStorage.getItem('nestfinance_active_finance_entity_name') || null
  );

  const lastUsedFinanceEntityId = localStorage.getItem('nestfinance_active_finance_entity_id') || null;

  const setActiveFinanceEntityId = (id: string | null, name?: string) => {
    setActiveFinanceEntityIdState(id);
    setActiveFinanceEntityNameState(name || null);
    
    if (id) {
      sessionStorage.setItem('nestfinance_active_finance_entity_id', id);
      localStorage.setItem('nestfinance_active_finance_entity_id', id);
      if (name) {
         sessionStorage.setItem('nestfinance_active_finance_entity_name', name);
         localStorage.setItem('nestfinance_active_finance_entity_name', name);
      }
    } else {
      sessionStorage.removeItem('nestfinance_active_finance_entity_id');
      sessionStorage.removeItem('nestfinance_active_finance_entity_name');
    }
  };

  return (
    <FinanceEntityContext.Provider value={{ activeFinanceEntityId, activeFinanceEntityName, lastUsedFinanceEntityId, setActiveFinanceEntityId }}>
      {children}
    </FinanceEntityContext.Provider>
  );
}

export function useFinanceEntity() {
  const context = useContext(FinanceEntityContext);
  if (context === undefined) {
    throw new Error('useFinanceEntity must be used within a FinanceEntityProvider');
  }
  return context;
}
