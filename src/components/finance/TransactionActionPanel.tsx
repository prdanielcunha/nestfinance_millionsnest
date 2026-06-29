import React from "react";
import { useNavigate } from "react-router-dom";
import { APP_ROUTES } from "@/src/app/router/routes";
import { CheckCircle2, AlertCircle, RefreshCw, PenSquare, ArrowRight, Eye, ShieldCheck, ArrowLeft } from "lucide-react";

export type TransactionAction = {
  label: string;
  action: () => void;
  icon?: React.ReactNode;
  primary?: boolean;
  disabled?: boolean;
};

export type TransactionNextStep = {
  status:
    | 'draft_incomplete'
    | 'draft_complete'
    | 'ready_for_review'
    | 'returned_for_correction'
    | 'approved_for_posting'
    | 'approval_stale';

  title: string;
  message: string;
  affectsBalance: false;
  pendingFindings: Array<{
    code: string;
    severity: 'blocking' | 'warning' | 'info';
    message: string;
    field?: string;
  }>;
  primaryAction?: TransactionAction;
  secondaryActions: TransactionAction[];
};

interface TransactionActionPanelProps {
  nextStep: TransactionNextStep;
}

export function TransactionActionPanel({ nextStep }: TransactionActionPanelProps) {
  return (
    <div className="bg-surface-elevated border border-border-subtle rounded-2xl overflow-hidden mb-6 shadow-sm">
      <div className={`p-6 border-b ${getBorderColor(nextStep.status)}`}>
        <div className="flex items-start gap-4">
          <div className="mt-1">
            {getStatusIcon(nextStep.status)}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-text-primary mb-1">{nextStep.title}</h2>
            <p className="text-text-secondary text-sm">{nextStep.message}</p>
            
            {nextStep.affectsBalance === false && (
              <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface-secondary rounded-lg text-text-muted text-xs font-medium border border-border-subtle">
                <AlertCircle className="w-3.5 h-3.5" />
                Esta movimentação ainda não alterou o saldo
              </div>
            )}
          </div>
        </div>
      </div>
      
      {nextStep.pendingFindings && nextStep.pendingFindings.length > 0 && (
        <div className="bg-amber-50/50 border-b border-border-subtle p-5">
          <h3 className="text-sm font-medium text-amber-800 mb-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Pendências encontradas
          </h3>
          <ul className="space-y-2">
            {nextStep.pendingFindings.map((f, i) => (
              <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                <span>{f.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      <div className="p-5 flex flex-col sm:flex-row items-center gap-3 bg-surface-base">
        {nextStep.primaryAction && (
          <button
            onClick={nextStep.primaryAction.action}
            disabled={nextStep.primaryAction.disabled}
            className="w-full sm:w-auto px-6 h-12 bg-accent-primary hover:bg-accent-primary-hover text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {nextStep.primaryAction.icon}
            {nextStep.primaryAction.label}
          </button>
        )}
        
        <div className="flex-1 w-full flex flex-col sm:flex-row items-center gap-3 sm:justify-end">
          {nextStep.secondaryActions.map((action, i) => (
            <button
              key={i}
              onClick={action.action}
              disabled={action.disabled}
              className={`w-full sm:w-auto px-4 h-12 ${
                action.primary 
                  ? 'bg-surface-secondary text-text-primary hover:bg-surface-hover border border-border-subtle font-medium' 
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-secondary font-medium'
              } rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-sm`}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'draft_incomplete':
      return <PenSquare className="w-7 h-7 text-amber-500" />;
    case 'draft_complete':
      return <PenSquare className="w-7 h-7 text-accent-primary" />;
    case 'ready_for_review':
      return <RefreshCw className="w-7 h-7 text-blue-500" />;
    case 'returned_for_correction':
      return <AlertCircle className="w-7 h-7 text-rose-500" />;
    case 'approved_for_posting':
      return <ShieldCheck className="w-7 h-7 text-emerald-500" />;
    case 'approval_stale':
      return <AlertCircle className="w-7 h-7 text-amber-500" />;
    default:
      return <CheckCircle2 className="w-7 h-7 text-text-muted" />;
  }
}

function getBorderColor(status: string) {
  switch (status) {
    case 'draft_incomplete':
      return 'border-amber-500/20';
    case 'draft_complete':
      return 'border-accent-primary/20';
    case 'ready_for_review':
      return 'border-blue-500/20';
    case 'returned_for_correction':
      return 'border-rose-500/20';
    case 'approved_for_posting':
      return 'border-emerald-500/20';
    case 'approval_stale':
      return 'border-amber-500/20';
    default:
      return 'border-border-subtle';
  }
}
