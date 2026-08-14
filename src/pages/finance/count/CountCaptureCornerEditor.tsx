import { useRef, useState, type PointerEvent } from 'react';
import type { CountCaptureNormalizedQuad } from '@/shared/finance/countCapture';

const HANDLE_LABELS = {
  PT: ['Canto superior esquerdo', 'Canto superior direito', 'Canto inferior direito', 'Canto inferior esquerdo'],
  EN: ['Top-left corner', 'Top-right corner', 'Bottom-right corner', 'Bottom-left corner'],
  ES: ['Esquina superior izquierda', 'Esquina superior derecha', 'Esquina inferior derecha', 'Esquina inferior izquierda'],
} as const;

export function CountCaptureCornerEditor({
  imageUrl,
  corners,
  language,
  onChange,
}: {
  imageUrl: string;
  corners: CountCaptureNormalizedQuad;
  language: 'PT' | 'EN' | 'ES';
  onChange: (next: CountCaptureNormalizedQuad) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging === null || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const next = corners.map((point) => ({ ...point })) as CountCaptureNormalizedQuad;
    next[dragging] = { x, y };
    onChange(next);
  };

  return (
    <div
      ref={containerRef}
      className="relative mx-auto w-full max-w-2xl touch-none select-none overflow-hidden rounded-xl bg-black/5"
      onPointerMove={move}
      onPointerUp={() => setDragging(null)}
      onPointerCancel={() => setDragging(null)}
      onPointerLeave={(event) => {
        if (event.buttons === 0) setDragging(null);
      }}
    >
      <img src={imageUrl} alt="" className="block h-auto w-full" draggable={false} />
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polygon
          points={corners.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')}
          fill="rgba(8,145,178,0.08)"
          stroke="currentColor"
          strokeWidth="0.7"
          className="text-accent-primary"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {corners.map((point, index) => (
        <button
          key={index}
          type="button"
          aria-label={HANDLE_LABELS[language][index]}
          className="absolute z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full border-2 border-white bg-accent-primary shadow-lg focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2"
          style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            setDragging(index);
          }}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-white" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
