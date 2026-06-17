// @ts-nocheck
import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('Uncaught error:', error, errorInfo);
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background-base text-text-primary flex flex-col items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-4">
            <h1 className="text-xl font-semibold">Ocorreu um erro inesperado</h1>
            <p className="text-sm text-text-secondary">
              A aplicação encontrou um problema e não pôde continuar.
            </p>
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 bg-surface-elevated hover:bg-surface-secondary border border-border-strong rounded-lg text-sm transition-colors press-fx"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
