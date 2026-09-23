import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  listAccessibleFinanceEntities,
  type AccessibleFinanceEntity,
} from '@/src/services/financeEntitiesService';
import { selectPreferredFinanceEntity } from '@/src/contexts/financeEntitySelection';

interface FinanceEntityContextType {
  activeFinanceEntityId: string | null;
  activeFinanceEntityName: string | null;
  lastUsedFinanceEntityId: string | null;
  accessibleFinanceEntities: AccessibleFinanceEntity[];
  accessibleFinanceEntitiesLoading: boolean;
  accessibleFinanceEntitiesError: boolean;
  setActiveFinanceEntityId: (id: string | null, name?: string) => void;
  refreshAccessibleFinanceEntities: () => Promise<AccessibleFinanceEntity[]>;
}

const FinanceEntityContext = createContext<FinanceEntityContextType | undefined>(undefined);

const ACTIVE_ID_KEY = 'nestfinance_active_finance_entity_id';
const ACTIVE_NAME_KEY = 'nestfinance_active_finance_entity_name';

function safeStorageRead(storage: Storage, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function FinanceEntityProvider({ children }: { children: ReactNode }) {
  const [activeFinanceEntityId, setActiveFinanceEntityIdState] = useState<string | null>(
    () => safeStorageRead(sessionStorage, ACTIVE_ID_KEY),
  );
  const [activeFinanceEntityName, setActiveFinanceEntityNameState] = useState<string | null>(
    () => safeStorageRead(sessionStorage, ACTIVE_NAME_KEY),
  );
  const [lastUsedFinanceEntityId, setLastUsedFinanceEntityId] = useState<string | null>(
    () => safeStorageRead(localStorage, ACTIVE_ID_KEY),
  );
  const [accessibleFinanceEntities, setAccessibleFinanceEntities] = useState<AccessibleFinanceEntity[]>([]);
  const [accessibleFinanceEntitiesLoading, setAccessibleFinanceEntitiesLoading] = useState(true);
  const [accessibleFinanceEntitiesError, setAccessibleFinanceEntitiesError] = useState(false);

  const setActiveFinanceEntityId = useCallback((id: string | null, name?: string) => {
    setActiveFinanceEntityIdState(id);
    setActiveFinanceEntityNameState(name || null);

    try {
      if (id) {
        sessionStorage.setItem(ACTIVE_ID_KEY, id);
        localStorage.setItem(ACTIVE_ID_KEY, id);
        setLastUsedFinanceEntityId(id);

        if (name) {
          sessionStorage.setItem(ACTIVE_NAME_KEY, name);
          localStorage.setItem(ACTIVE_NAME_KEY, name);
        } else {
          sessionStorage.removeItem(ACTIVE_NAME_KEY);
        }
      } else {
        sessionStorage.removeItem(ACTIVE_ID_KEY);
        sessionStorage.removeItem(ACTIVE_NAME_KEY);
      }
    } catch {
      // Storage is a convenience only. Canonical access is always revalidated server-side.
    }
  }, []);

  const refreshAccessibleFinanceEntities = useCallback(async () => {
    setAccessibleFinanceEntitiesLoading(true);
    setAccessibleFinanceEntitiesError(false);

    try {
      const result = await listAccessibleFinanceEntities();
      const entities = result.entities;
      setAccessibleFinanceEntities(entities);

      const sessionId = safeStorageRead(sessionStorage, ACTIVE_ID_KEY);
      const rememberedId = safeStorageRead(localStorage, ACTIVE_ID_KEY);
      const selected = selectPreferredFinanceEntity(entities, sessionId, rememberedId);

      if (selected) {
        setActiveFinanceEntityId(selected.id, selected.displayName);
      } else {
        setActiveFinanceEntityId(null);
      }

      return entities;
    } catch {
      setAccessibleFinanceEntities([]);
      setAccessibleFinanceEntitiesError(true);
      setActiveFinanceEntityId(null);
      return [];
    } finally {
      setAccessibleFinanceEntitiesLoading(false);
    }
  }, [setActiveFinanceEntityId]);

  useEffect(() => {
    void refreshAccessibleFinanceEntities();
  }, [refreshAccessibleFinanceEntities]);

  return (
    <FinanceEntityContext.Provider
      value={{
        activeFinanceEntityId,
        activeFinanceEntityName,
        lastUsedFinanceEntityId,
        accessibleFinanceEntities,
        accessibleFinanceEntitiesLoading,
        accessibleFinanceEntitiesError,
        setActiveFinanceEntityId,
        refreshAccessibleFinanceEntities,
      }}
    >
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
