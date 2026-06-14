import { useState, useEffect, useCallback } from 'react';
import { X, ArrowRight, ArrowLeft } from 'lucide-react';

const TOUR_KEY = 'lumina-tour-done';

interface Step {
  target: string; // data-tour value
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const STEPS: Step[] = [
  {
    target: 'sidebar',
    title: 'Your Conversations',
    description: 'All your chats live here. Switch between them, search, or start a new one anytime.',
    position: 'right',
  },
  {
    target: 'new-chat',
    title: 'New Chat',
    description: 'Start a fresh conversation with any AI model.',
    position: 'right',
  },
  {
    target: 'chat-input',
    title: 'Chat Input',
    description: 'Type your message here. You can attach files, images, and use tools like web search right from this box.',
    position: 'top',
  },
  {
    target: 'providers-btn',
    title: 'Providers',
    description: 'Add or manage AI providers — OpenAI, Anthropic, Ollama, and more. Each provider unlocks different models.',
    position: 'right',
  },
  {
    target: 'settings-btn',
    title: 'Settings',
    description: 'Customize everything: appearance, models, tools, memory, cloud sync, and more. You\'ll find it all in here.',
    position: 'right',
  },
];

const PAD = 8; // padding around highlight rect

interface Rect { top: number; left: number; width: number; height: number }

function getTargetRect(target: string): Rect | null {
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
}

function TooltipBox({
  step,
  rect,
  index,
  total,
  onNext,
  onPrev,
  onClose,
}: {
  step: Step;
  rect: Rect | null;
  index: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let style: React.CSSProperties = { position: 'fixed', zIndex: 10001 };
  const boxW = 280;
  const boxH = 160; // approx

  if (!rect) {
    style = { ...style, top: '50%', left: '50%', transform: 'translate(-50%,-50%)' };
  } else {
    const pos = step.position;
    if (pos === 'right') {
      let top = rect.top + rect.height / 2 - boxH / 2;
      top = Math.max(12, Math.min(vh - boxH - 12, top));
      let left = rect.left + rect.width + 12;
      if (left + boxW > vw - 12) left = rect.left - boxW - 12;
      style = { ...style, top, left };
    } else if (pos === 'left') {
      let top = rect.top + rect.height / 2 - boxH / 2;
      top = Math.max(12, Math.min(vh - boxH - 12, top));
      style = { ...style, top, left: rect.left - boxW - 12 };
    } else if (pos === 'top') {
      let left = rect.left + rect.width / 2 - boxW / 2;
      left = Math.max(12, Math.min(vw - boxW - 12, left));
      let top = rect.top - boxH - 12;
      if (top < 12) top = rect.top + rect.height + 12;
      style = { ...style, top, left };
    } else {
      let left = rect.left + rect.width / 2 - boxW / 2;
      left = Math.max(12, Math.min(vw - boxW - 12, left));
      style = { ...style, top: rect.top + rect.height + 12, left };
    }
  }

  return (
    <div style={{ ...style, width: boxW }} className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-2xl shadow-2xl p-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-[rgb(var(--text))] text-sm leading-snug">{step.title}</h3>
        <button onClick={onClose} className="btn-icon shrink-0 -mt-0.5 -mr-1">
          <X size={14} />
        </button>
      </div>
      <p className="text-xs text-[rgb(var(--muted))] leading-relaxed mb-4">{step.description}</p>
      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-[rgb(var(--muted))]">{index + 1} / {total}</span>
        <div className="flex items-center gap-2">
          {index > 0 && (
            <button onClick={onPrev} className="btn-secondary inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs">
              <ArrowLeft size={12} /> Back
            </button>
          )}
          {index < total - 1 ? (
            <button onClick={onNext} className="btn-primary inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs">
              Next <ArrowRight size={12} />
            </button>
          ) : (
            <button onClick={onClose} className="btn-primary px-3 py-1.5 rounded-full text-xs">
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function isTourDone() {
  return !!localStorage.getItem(TOUR_KEY);
}

export default function TourOverlay({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [visible, setVisible] = useState(true);

  const step = STEPS[index];

  const updateRect = useCallback(() => {
    setRect(getTargetRect(step.target));
  }, [step.target]);

  useEffect(() => {
    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [updateRect]);

  const close = () => {
    setVisible(false);
    localStorage.setItem(TOUR_KEY, '1');
    setTimeout(onDone, 200);
  };

  const next = () => {
    if (index < STEPS.length - 1) setIndex(i => i + 1);
    else close();
  };

  const prev = () => {
    if (index > 0) setIndex(i => i - 1);
  };

  if (!visible) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // SVG spotlight: full-screen overlay with a cutout hole
  const r = rect;
  const rx = 12;

  return (
    <>
      {/* SVG overlay with cutout */}
      <svg
        style={{ position: 'fixed', inset: 0, zIndex: 10000, pointerEvents: 'all', transition: 'opacity 200ms' }}
        width={vw}
        height={vh}
        onClick={close}
      >
        <defs>
          <mask id="tour-mask">
            <rect width={vw} height={vh} fill="white" />
            {r && (
              <rect
                x={r.left}
                y={r.top}
                width={r.width}
                height={r.height}
                rx={rx}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width={vw} height={vh} fill="rgba(0,0,0,0.55)" mask="url(#tour-mask)" />
        {/* Highlight border around target */}
        {r && (
          <rect
            x={r.left}
            y={r.top}
            width={r.width}
            height={r.height}
            rx={rx}
            fill="none"
            stroke="rgb(var(--accent))"
            strokeWidth={2}
            style={{ pointerEvents: 'none' }}
          />
        )}
      </svg>

      {/* Tooltip */}
      <TooltipBox
        step={step}
        rect={rect}
        index={index}
        total={STEPS.length}
        onNext={next}
        onPrev={prev}
        onClose={close}
      />
    </>
  );
}
