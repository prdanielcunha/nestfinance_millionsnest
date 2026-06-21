import { FinanceContextHeader } from '@/src/components/finance/FinanceContextHeader';
import { FinanceContextGuard } from '@/src/components/finance/FinanceContextGuard';

export function FinancePlaceholderPage({ pageName, title, description }: { pageName: string, title: string, description: string }) {
  return (
    <div className="flex flex-col h-full fade-in pb-20 md:pb-0">
      <FinanceContextHeader
        pageName={pageName}
        title={title}
        description={description}
      />
      <FinanceContextGuard>
        <main className="flex-1 flex items-center justify-center p-8 bg-surface-base">
          <div className="w-full h-full max-h-[60vh] max-w-2xl flex flex-col items-center justify-center border-2 border-dashed border-border-strong rounded-3xl bg-surface-secondary/50">
            <div className="text-center space-y-2 p-6">
              <p className="text-sm font-medium text-text-primary">Estrutura preparada para: {title}</p>
              <p className="text-xs text-text-muted max-w-xs mx-auto">A implementação gráfica e os dados serão adicionados nas próximas fases do desenvolvimento do NestFinance.</p>
            </div>
          </div>
        </main>
      </FinanceContextGuard>
    </div>
  );
}
