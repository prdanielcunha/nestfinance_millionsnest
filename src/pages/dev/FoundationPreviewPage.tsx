import { ShellLayout } from '@/src/app/layouts/ShellLayout';

export default function FoundationPreviewPage() {
  return (
    <div className="border-4 border-dashed border-semantic-warning p-4 rounded-xl fade-in m-4">
      <div className="flex flex-col space-y-4">
        <h1 className="text-xl text-semantic-warning font-semibold">Preview Visual (Apenas DEV)</h1>
        <p className="text-sm text-text-muted">
          Este ambiente existe apenas para revisar o layout visual responsivo. 
          Nenhuma integração com o Firestore ou regras de acesso reais são aplicadas aqui.
        </p>
        <div className="p-4 bg-surface-secondary rounded-lg">
          <p className="text-sm font-mono text-text-secondary">Componentes e tokens em validação.</p>
        </div>
      </div>
    </div>
  );
}
