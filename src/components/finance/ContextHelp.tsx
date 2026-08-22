import { useEffect, useId, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { IconButton } from '@/src/components/foundation';
import { useLanguage, type Language } from '@/src/contexts/LanguageContext';

interface ContextHelpProps {
  topic:
    | 'account'
    | 'fund'
    | 'category'
    | 'payment_method'
    | 'cost_center'
    | 'draft'
    | 'review'
    | 'liability_settlement'
    | 'cash_account';
}

type HelpCopy = {
  title: string;
  text: string;
};

type TopicCopy = Record<ContextHelpProps['topic'], HelpCopy>;

const HELP_DATA: Record<Language, TopicCopy> = {
  PT: {
    account: {
      title: 'Onde o dinheiro fica',
      text: 'A conta bancária ou o caixa físico onde esta entrada ou saída acontece. Escolha o local que realmente guarda ou movimenta o dinheiro.',
    },
    fund: {
      title: 'Destino do dinheiro',
      text: 'Use quando um valor foi separado para um objetivo específico, como missões, construção ou um projeto da igreja.',
    },
    category: {
      title: 'Tipo de entrada ou saída',
      text: 'Ajuda a organizar o motivo da movimentação, como dízimos, aluguel ou manutenção, para que relatórios e prestações de contas fiquem claros.',
    },
    payment_method: {
      title: 'Como foi pago ou recebido',
      text: 'Informe o meio usado nesta movimentação, como Pix, dinheiro, cartão, boleto ou cheque.',
    },
    cost_center: {
      title: 'Área responsável',
      text: 'Indica qual ministério, departamento ou unidade está ligado a esta movimentação. Use quando precisar acompanhar custos por área.',
    },
    draft: {
      title: 'Salvar para terminar depois',
      text: 'O rascunho guarda o que você já informou sem concluir a movimentação. Você pode voltar e terminar quando estiver pronto.',
    },
    review: {
      title: 'Enviar para conferência',
      text: 'A movimentação fica pronta para outra pessoa autorizada conferir as informações antes do próximo passo.',
    },
    liability_settlement: {
      title: 'Pagamento de uma obrigação',
      text: 'Use quando estiver quitando algo que já havia sido registrado como valor a pagar, como uma fatura ou outro compromisso anterior.',
    },
    cash_account: {
      title: 'Dinheiro em espécie',
      text: 'É o dinheiro vivo guardado fisicamente pela tesouraria. Escolha esta opção somente quando a movimentação realmente passar pelo caixa físico.',
    },
  },
  EN: {
    account: {
      title: 'Where the money is kept',
      text: 'The bank account or physical cash box where this income or expense happens. Choose the place that actually holds or moves the money.',
    },
    fund: {
      title: 'What the money is for',
      text: 'Use this when money has been set aside for a specific purpose, such as missions, construction, or a church project.',
    },
    category: {
      title: 'Type of income or expense',
      text: 'Organizes the reason for the transaction, such as tithes, rent, or maintenance, so reports and accountability stay clear.',
    },
    payment_method: {
      title: 'How it was paid or received',
      text: 'Choose the method used for this transaction, such as Pix, cash, card, bank slip, or check.',
    },
    cost_center: {
      title: 'Responsible area',
      text: 'Shows which ministry, department, or unit is connected to this transaction. Use it when you need to track costs by area.',
    },
    draft: {
      title: 'Save and finish later',
      text: 'A draft keeps what you have already entered without completing the transaction. You can come back and finish it later.',
    },
    review: {
      title: 'Send for checking',
      text: 'The transaction becomes ready for another authorized person to check the information before the next step.',
    },
    liability_settlement: {
      title: 'Pay an existing obligation',
      text: 'Use this when paying something that was already recorded as payable, such as a bill or another previous obligation.',
    },
    cash_account: {
      title: 'Physical cash',
      text: 'Cash physically held by the treasury. Choose this only when the transaction really goes through the physical cash box.',
    },
  },
  ES: {
    account: {
      title: 'Dónde está el dinero',
      text: 'La cuenta bancaria o caja física donde ocurre este ingreso o egreso. Elige el lugar que realmente guarda o mueve el dinero.',
    },
    fund: {
      title: 'Para qué está destinado el dinero',
      text: 'Úsalo cuando un valor fue separado para un objetivo específico, como misiones, construcción o un proyecto de la iglesia.',
    },
    category: {
      title: 'Tipo de ingreso o egreso',
      text: 'Organiza el motivo del movimiento, como diezmos, alquiler o mantenimiento, para que los informes y rendiciones sean claros.',
    },
    payment_method: {
      title: 'Cómo se pagó o recibió',
      text: 'Indica el medio usado en este movimiento, como Pix, efectivo, tarjeta, boleto bancario o cheque.',
    },
    cost_center: {
      title: 'Área responsable',
      text: 'Indica qué ministerio, departamento o unidad está relacionado con este movimiento. Úsalo cuando necesites acompañar costos por área.',
    },
    draft: {
      title: 'Guardar y terminar después',
      text: 'El borrador guarda lo que ya informaste sin concluir el movimiento. Puedes volver y terminarlo cuando estés listo.',
    },
    review: {
      title: 'Enviar para revisión',
      text: 'El movimiento queda listo para que otra persona autorizada revise la información antes del siguiente paso.',
    },
    liability_settlement: {
      title: 'Pago de una obligación',
      text: 'Úsalo cuando estés pagando algo que ya había sido registrado como pendiente de pago, como una factura u otro compromiso anterior.',
    },
    cash_account: {
      title: 'Dinero en efectivo',
      text: 'Es el dinero físico guardado por la tesorería. Elige esta opción solo cuando el movimiento realmente pase por la caja física.',
    },
  },
};

const TRIGGER_LABEL: Record<Language, string> = {
  PT: 'Entender este campo',
  EN: 'Understand this field',
  ES: 'Entender este campo',
};

export default function ContextHelp({ topic }: ContextHelpProps) {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();
  const { title, text } = HELP_DATA[language][topic];

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <span
      ref={rootRef}
      className="relative ml-0.5 inline-flex align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <IconButton
        label={TRIGGER_LABEL[language]}
        icon={<HelpCircle className="h-4 w-4" />}
        variant="ghost"
        className="-my-2 h-9 min-h-11 w-9 min-w-11 rounded-lg"
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={() => setOpen((current) => !current)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />

      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          className="nf-glass pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl p-4 text-left"
        >
          <span className="mb-1.5 block text-sm font-semibold leading-snug text-text-primary">
            {title}
          </span>
          <span className="block text-xs font-normal leading-relaxed text-text-secondary">
            {text}
          </span>
        </span>
      ) : null}
    </span>
  );
}
