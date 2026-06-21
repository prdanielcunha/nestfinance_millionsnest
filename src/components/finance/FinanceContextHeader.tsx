import { ReactNode } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { useFinanceEntity } from '@/src/contexts/FinanceEntityContext';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  pageName: string;
  title?: string;
  description?: string;
  backTo?: string;
  rightContent?: ReactNode;
}

export function FinanceContextHeader({ pageName, title, description, backTo, rightContent }: Props) {
  const { accessState } = useAuth();
  const { activeFinanceEntityId, activeFinanceEntityName } = useFinanceEntity();
  const navigate = useNavigate();

  const orgName = accessState.organization?.name;
  const entityName = activeFinanceEntityName;
  const isLoaded = accessState.organization !== undefined;
  const isValidEntity = activeFinanceEntityId && activeFinanceEntityName;

  if (!isLoaded) {
    return (
      <header className="flex-shrink-0 border-b border-border-subtle bg-surface-base px-4 py-4 flex flex-col gap-4 sticky top-0 z-10 transition-colors duration-200">
        <div className="animate-pulse flex gap-2">
          <div className="h-4 bg-surface-secondary rounded w-20"></div>
          <div className="h-4 bg-surface-secondary rounded w-2"></div>
          <div className="h-4 bg-surface-secondary rounded w-24"></div>
        </div>
        {title && (
          <div className="animate-pulse flex gap-3 mt-1">
            {backTo && <div className="w-11 h-11 bg-surface-secondary rounded-full" />}
            <div className="flex flex-col gap-2 justify-center">
              <div className="h-6 bg-surface-secondary rounded w-48"></div>
              {description && <div className="h-4 bg-surface-secondary rounded w-64 md:hidden"></div>}
            </div>
          </div>
        )}
      </header>
    );
  }

  return (
    <header className="flex-shrink-0 border-b border-border-subtle bg-surface-base px-4 py-4 flex flex-col gap-4 sticky top-0 z-10 transition-colors duration-200">
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
        <div className="flex items-center flex-wrap text-sm text-text-muted">
          <span className="hidden sm:inline">{orgName || 'Organização'}</span>
          <span className="mx-2 hidden sm:inline">/</span>
          {isValidEntity ? (
            <>
              <span className="truncate max-w-[200px] text-text-primary sm:text-text-muted font-medium sm:font-normal">
                {entityName}
              </span>
              <span className="mx-2">/</span>
              <span className="text-text-muted sm:text-text-primary sm:font-medium">{pageName}</span>
            </>
          ) : (
            <span className="text-text-primary font-medium">{pageName}</span>
          )}
        </div>
        
        {rightContent}
      </div>
      
      {title && (
        <div className="flex items-center gap-3">
          {backTo && (
            <button 
              onClick={() => navigate(backTo)}
              className="p-1.5 -ml-1.5 text-text-muted hover:text-text-base rounded-full hover:bg-surface-elevated transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex-1">
            <h1 className="text-xl font-medium tracking-tight text-text-base md:text-lg">{title}</h1>
            {description && <p className="text-sm text-text-muted mt-0.5 md:hidden">{description}</p>}
          </div>
        </div>
      )}
    </header>
  );
}
