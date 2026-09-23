import { useState } from 'react';

export interface SpeakInstructionButtonProps {
  text: string;
  language: 'PT' | 'EN' | 'ES';
  label: string;
  stopLabel: string;
  className?: string;
}

const LOCALE = {
  PT: 'pt-BR',
  EN: 'en-US',
  ES: 'es-ES',
} as const;

export function SpeakInstructionButton({
  text,
  language,
  label,
  stopLabel,
  className = '',
}: SpeakInstructionButtonProps) {
  const [speaking, setSpeaking] = useState(false);
  const supported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined';

  if (!supported) return null;

  const toggle = () => {
    window.speechSynthesis.cancel();
    if (speaking) {
      setSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LOCALE[language];
    utterance.rate = 0.95;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={`nf-interactive min-h-[3.25rem] rounded-xl border border-border-subtle bg-surface-secondary px-4 text-base font-semibold text-text-primary hover:border-border-strong ${className}`}
      aria-pressed={speaking}
    >
      {speaking ? stopLabel : label}
    </button>
  );
}
