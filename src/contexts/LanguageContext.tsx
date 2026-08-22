import React, { createContext, useContext, useState, ReactNode } from 'react';

export type Language = 'PT' | 'EN' | 'ES';

interface Translations {
  [key: string]: {
    PT: string;
    EN: string;
    ES: string;
  };
}

export const TRANSLATIONS: Translations = {
  // Navigation
  nav_hoje: { PT: 'Hoje', EN: 'Today', ES: 'Hoy' },
  nav_cultos: { PT: 'Cultos', EN: 'Services', ES: 'Cultos' },
  nav_capturas: { PT: 'Capturas', EN: 'Captures', ES: 'Capturas' },
  nav_conferir: { PT: 'Conferir', EN: 'Check', ES: 'Confrontar' },
  nav_mais: { PT: 'Mais', EN: 'More', ES: 'Más' },
  nav_config: { PT: 'Configurações', EN: 'Settings', ES: 'Ajustes' },
  nav_reports: { PT: 'Relatórios', EN: 'Reports', ES: 'Informes' },
  nav_audit: { PT: 'Auditoria', EN: 'Audit', ES: 'Auditoría' },

  // MorePage
  more_title: { PT: 'Mais Opções', EN: 'More Options', ES: 'Más Opciones' },
  more_desc: { PT: 'Navegação adicional do sistema corporativo.', EN: 'Additional navigation of the corporate system.', ES: 'Navegación adicional del sistema corporativo.' },
  more_churches_title: { PT: 'Igrejas e CNPJs', EN: 'Churches and Tax IDs', ES: 'Iglesias y CNPJ' },
  more_churches_desc: { PT: 'Gestão das igrejas que compõem a organização.', EN: 'Management of the churches that make up the organization.', ES: 'Gestión de las iglesias que componen la organización.' },
  more_other_areas: { PT: 'Outras Áreas', EN: 'Other Areas', ES: 'Otras Áreas' },

  // Shell Layout
  shell_organization: { PT: 'Organização', EN: 'Organization', ES: 'Organización' },
  shell_waiting: { PT: 'Aguardando conexão', EN: 'Waiting connection', ES: 'Esperando conexión' },
  shell_principal: { PT: 'Principal', EN: 'Main', ES: 'Principal' },
  shell_more: { PT: 'Mais', EN: 'More', ES: 'Más' },

  // Select Entity Page
  select_entity_title: { PT: 'Onde você quer trabalhar?', EN: 'Where do you want to work?', ES: '¿Dónde quieres trabajar?' },
  select_entity_desc: { PT: 'Escolha a igreja para acessar os dados financeiros.', EN: 'Choose the church to access financial data.', ES: 'Elija la iglesia para acceder a los datos financieros.' },
  select_entity_last_used: { PT: 'Última usada', EN: 'Last used', ES: 'Última usada' },
  select_entity_access: { PT: 'Acessar finanças', EN: 'Access finance', ES: 'Acceder a finanzas' },
  select_entity_prepare_title: { PT: 'Tornar estas organizações utilizáveis', EN: 'Make these organizations usable', ES: 'Hacer que estas organizaciones sean utilizables' },
  select_entity_prepare_desc: { PT: 'Preparação pendente', EN: 'Pending setup', ES: 'Configuración pendiente' },
  select_entity_prepare_btn: { PT: 'Preparar', EN: 'Prepare', ES: 'Preparar' },
  select_entity_none: { PT: 'Nenhuma organização disponível', EN: 'No organizations available', ES: 'Ninguna organización disponible' },
  select_entity_none_desc: { PT: 'Você não possui igrejas aptas para gerenciar finanças no momento.', EN: 'You do not have churches ready to manage finances at the moment.', ES: 'No tiene iglesias listas para administrar finanzas en este momento.' },
  select_entity_current_church: { PT: 'Igreja atual', EN: 'Current church', ES: 'Iglesia actual' },
  select_entity_switch_btn: { PT: 'Trocar', EN: 'Switch', ES: 'Cambiar' },
  select_entity_modal_title: { PT: 'Selecionar igreja', EN: 'Select church', ES: 'Seleccionar iglesia' },
  select_entity_cancel: { PT: 'Cancelar', EN: 'Cancel', ES: 'Cancelar' },

  // General Status & Loading & Errors
  status_loading: { PT: 'Carregando...', EN: 'Loading...', ES: 'Cargando...' },
  status_error_title: { PT: 'Falha ao carregar dados financeiros', EN: 'Failed to load financial data', ES: 'Error al cargar los datos financieros' },
  status_error_desc: { PT: 'Não foi possível validar a estrutura organizacional base. Verifique sua conexão ou tente novamente.', EN: 'Could not validate the base organizational structure. Check your connection or try again.', ES: 'No se pudo validar la estructura organizacional base. Verifique su conexión o intente nuevamente.' },
  status_retry: { PT: 'Tentar novamente', EN: 'Try again', ES: 'Intentar de nuevo' },
  status_empty_work: { PT: 'Tudo limpo por aqui!', EN: 'All clear here!', ES: '¡Todo limpio por aquí!' },
  status_empty_work_desc: { PT: 'Nenhuma tarefa pendente precisa da sua atenção no momento. Excelente trabalho!', EN: 'No pending tasks require your attention at the moment. Great job!', ES: 'Ninguna tarea pendiente requiere su atención en este momento. ¡Excelente trabalho!' },

  // Today "Hoje" Screen Header & Greeting
  today_greeting_morning: { PT: 'Bom dia', EN: 'Good morning', ES: 'Buen día' },
  today_greeting_afternoon: { PT: 'Boa tarde', EN: 'Good afternoon', ES: 'Buenas tardes' },
  today_greeting_evening: { PT: 'Boa noite', EN: 'Good evening', ES: 'Buenas noches' },
  today_title: { PT: 'Hoje', EN: 'Today', ES: 'Hoy' },
  today_period: { PT: 'Período atual', EN: 'Current period', ES: 'Período actual' },

  // "Precisa de você" Card States
  needs_attention_title: { PT: 'Precisa de você', EN: 'Needs attention', ES: 'Necesita tu atención' },
  action_correction_title: { PT: 'Movimentações devolvidas', EN: 'Returned transactions', ES: 'Transacciones devueltas' },
  action_correction_desc: { PT: 'Você tem {count} lançamento(s) devolvido(s) para correção.', EN: 'You have {count} transaction(s) returned for correction.', ES: 'Tiene {count} transacción(es) devuelta(s) para corrección.' },
  action_correction_cta: { PT: 'Corrigir lançamentos', EN: 'Correct transactions', ES: 'Corregir transacciones' },

  action_review_title: { PT: 'Aguardando revisão', EN: 'Awaiting review', ES: 'Esperando revisión' },
  action_review_desc: { PT: 'Existem {count} lançamento(s) pendente(s) de aprovação na sua central.', EN: 'There are {count} transaction(s) pending approval in your center.', ES: 'Hay {count} transacción(es) pendiente(s) de aprobación en su centro.' },
  action_review_cta: { PT: 'Revisar agora', EN: 'Review now', ES: 'Revisar ahora' },

  action_draft_title: { PT: 'Rascunhos incompletos', EN: 'Incomplete drafts', ES: 'Borradores incompletos' },
  action_draft_desc: { PT: 'Você tem {count} rascunho(s) salvo(s) aguardando preenchimento.', EN: 'You have {count} saved draft(s) awaiting completion.', ES: 'Tiene {count} borrador(es) guardado(s) esperando ser completado(s).' },
  action_draft_cta: { PT: 'Continuar preenchendo', EN: 'Continue filling', ES: 'Continuar llenando' },

  action_approved_title: { PT: 'Aprovadas para lançamento', EN: 'Approved for posting', ES: 'Aprobadas para registro' },
  action_approved_desc: { PT: 'Existem {count} movimentação(ões) aprovada(s) aguardando o próximo passo.', EN: 'There are {count} approved transaction(s) awaiting the next step.', ES: 'Hay {count} transacción(es) aprobada(s) esperando el siguiente paso.' },
  action_approved_cta: { PT: 'Ver aprovadas', EN: 'View approved', ES: 'Ver aprovadas' },

  action_register_title: { PT: 'Registrar nova movimentação', EN: 'Register new transaction', ES: 'Registrar nueva transacción' },
  action_register_desc: { PT: 'Inicie um novo rascunho de entrada, saída ou transferência.', EN: 'Start a new income, expense, or transfer draft.', ES: 'Inicie un nuevo borrador de ingreso, egreso o transferencia.' },
  action_register_cta: { PT: 'Registrar', EN: 'Register', ES: 'Registrar' },

  action_unauthorized_title: { PT: 'Acesso somente leitura', EN: 'Read-only access', ES: 'Acceso de solo lectura' },
  action_unauthorized_desc: { PT: 'Seu papel atual permite visualizar os dados, mas sem realizar lançamentos.', EN: 'Your current role allows you to view data, but not post transactions.', ES: 'Su función actual le permite ver datos, pero no registrar transacciones.' },

  // Operational Summary Section
  operational_summary_title: { PT: 'Resumo Operacional', EN: 'Operational Summary', ES: 'Resumen Operacional' },
  op_returned: { PT: 'Devolvidas para Correção', EN: 'Returned for Correction', ES: 'Devueltas para Corrección' },
  op_awaiting: { PT: 'Aguardando Revisão', EN: 'Awaiting Review', ES: 'Esperando Revisión' },
  op_drafts: { PT: 'Rascunhos', EN: 'Drafts', ES: 'Borradores' },
  op_approved: { PT: 'Aprovadas para o próximo passo', EN: 'Approved for the next step', ES: 'Aprobadas para el siguiente paso' },
  op_posted: { PT: 'Transações concretizadas', EN: 'Completed transactions', ES: 'Transacciones realizadas' },
  op_posted_desc: { PT: 'Entradas e saídas publicadas e finais.', EN: 'Published and final income and expenses.', ES: 'Ingresos y egresos publicados y finales.' },
  op_view_posted: { PT: 'Ver transações lançadas', EN: 'View posted transactions', ES: 'Ver transacciones registradas' },

  // Shortcuts Section
  shortcuts_title: { PT: 'Atalhos de Registro', EN: 'Registration Shortcuts', ES: 'Atajos de Registro' },
  shortcut_income: { PT: 'Nova Entrada', EN: 'New Income', ES: 'Nuevo Ingreso' },
  shortcut_expense: { PT: 'Nova Saída', EN: 'New Expense', ES: 'Nuevo Egreso' },
  shortcut_transfer: { PT: 'Transferência', EN: 'Transfer', ES: 'Transferencia' },

  // Organization Finance Settings Section
  org_settings_title: { PT: 'Organização Financeira', EN: 'Financial Organization', ES: 'Organización Financiera' },
  org_settings_desc: { PT: 'Ajustar os parâmetros estruturais da sua igreja.', EN: 'Adjust the structural parameters of your church.', ES: 'Ajustar los parámetros estruturales de su iglesia.' },
  org_settings_cta: { PT: 'Organizar finanças', EN: 'Organize finance', ES: 'Organizar finanzas' },

  // Activity Feed
  recent_activity_title: { PT: 'Atividade Recente', EN: 'Recent Activity', ES: 'Actividad Reciente' },
  recent_activity_empty: { PT: 'Nenhuma movimentação registrada recentemente.', EN: 'No recent transactions recorded.', ES: 'Ninguna transacción registrada recientemente.' },
  activity_income: { PT: 'Entrada', EN: 'Income', ES: 'Ingreso' },
  activity_expense: { PT: 'Saída', EN: 'Expense', ES: 'Egreso' },
  activity_transfer: { PT: 'Transferência', EN: 'Transfer', ES: 'Transferencia' }
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof TRANSLATIONS, replacements?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('nestfinance_language') as Language;
    if (saved === 'PT' || saved === 'EN' || saved === 'ES') return saved;
    const browserLang = navigator.language.toLowerCase();
    if (browserLang.startsWith('es')) return 'ES';
    if (browserLang.startsWith('en')) return 'EN';
    return 'PT'; // default PT-BR
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('nestfinance_language', lang);
  };

  const t = (key: keyof typeof TRANSLATIONS, replacements?: Record<string, string | number>): string => {
    const translation = TRANSLATIONS[key];
    if (!translation) {
      return String(key);
    }
    let text = translation[language] || translation['PT'];
    if (replacements) {
      Object.entries(replacements).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
