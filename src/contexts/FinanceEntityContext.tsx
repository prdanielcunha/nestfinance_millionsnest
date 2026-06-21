import React, { createContext, useContext, useState, ReactNode } from 'react';

interface FinanceEntityContextType {
  activeFinanceEntityId: string | null;
  activeFinanceEntityName: string | null;
  setActiveFinanceEntityId: (id: string | null, name?: string) => void;
}

const FinanceEntityContext = createContext<FinanceEntityContextType | undefined>(undefined);

export function FinanceEntityProvider({ children }: { children: ReactNode }) {
  const [activeFinanceEntityId, setActiveFinanceEntityIdState] = useState<string | null>(
    localStorage.getItem('nestfinance_active_finance_entity_id') || null
  );
  const [activeFinanceEntityName, setActiveFinanceEntityNameState] = useState<string | null>(
    localStorage.getItem('nestfinance_active_finance_entity_name') || null
  );

  const setActiveFinanceEntityId = (id: string | null, name?: string) => {
    setActiveFinanceEntityIdState(id);
    setActiveFinanceEntityNameState(name || null);
    
    if (id) {
      localStorage.setItem('nestfinance_active_finance_entity_id', id);
      if (name) {
         localStorage.setItem('nestfinance_active_finance_entity_name', name);
      }
    } else {
      localStorage.removeItem('nestfinance_active_finance_entity_id');
      localStorage.removeItem('nestfinance_active_finance_entity_name');
    }
  };

  return (
    <FinanceEntityContext.Provider value={{ activeFinanceEntityId, activeFinanceEntityName, setActiveFinanceEntityId }}>
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
