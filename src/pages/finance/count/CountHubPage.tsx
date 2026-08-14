import { FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '@/src/app/router/routes';
import { Button } from '@/src/components/foundation';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAuth } from '@/src/hooks/useAuth';
import { hasEffectiveCapability } from '@/src/lib/permissions';
import CountPage from '../CountPage';

const LABEL = {
  PT: 'Folhas Count',
  EN: 'Count Sheets',
  ES: 'Hojas Count',
} as const;

export default function CountHubPage() {
  const navigate = useNavigate();
  const { accessState } = useAuth();
  const { language } = useLanguage();
  const canCreate = hasEffectiveCapability(accessState, 'finance.create_drafts');

  return (
    <div className="relative flex min-h-0 flex-1">
      <CountPage />
      {canCreate ? (
        <div className="fixed bottom-24 right-4 z-20 md:bottom-8 md:right-8">
          <Button
            variant="secondary"
            className="shadow-lg"
            onClick={() => navigate(APP_ROUTES.countPaperForms)}
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            {LABEL[language]}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
