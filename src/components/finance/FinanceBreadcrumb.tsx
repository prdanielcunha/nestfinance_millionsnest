import { useAuth } from '@/src/hooks/useAuth';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';

export default function FinanceBreadcrumb({ pageName }: { pageName: string }) {
  const { accessState } = useAuth();
  const { activeFinanceEntityName } = useFinanceEntity();
  
  const orgName = accessState.organization?.name || 'Organização';
  const entityName = activeFinanceEntityName || 'Gestão Financeira';

  return (
    <div className="flex items-center flex-wrap text-sm text-text-muted">
       <span>{orgName}</span>
       <span className="mx-2">/</span>
       <span>{entityName}</span>
       <span className="mx-2">/</span>
       <span className="text-text-primary font-medium">{pageName}</span>
    </div>
  );
}
