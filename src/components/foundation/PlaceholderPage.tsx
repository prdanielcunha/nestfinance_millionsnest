export function PlaceholderPage({ title, description }: { title: string, description: string }) {
  return (
    <div className="flex flex-col h-full fade-in space-y-4">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">{title}</h1>
        <p className="text-text-secondary mt-1">{description}</p>
      </header>
      
      <div className="flex-1 flex items-center justify-center border-2 border-dashed border-border-strong rounded-2xl bg-surface-secondary/50 min-h-[40vh]">
        <div className="text-center space-y-2 p-6">
          <p className="text-sm font-medium text-text-primary">Estrutura preparada</p>
          <p className="text-xs text-text-muted">A implementação gráfica e dados serão adicionados nas próximas fases.</p>
        </div>
      </div>
    </div>
  );
}
