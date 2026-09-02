import { useEffect, useId, useState, type ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';

interface ScoreFieldProps {
  label: string;
  description?: ReactNode;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  // 'compact' matches the existing dense desktop grids (Postseason Bonus
  // Points, Statistical Ranking Bonuses) that already used a smaller
  // uppercase label + centered input rather than the standard .label —
  // kept as-is on desktop so this component doesn't change those layouts.
  variant?: 'default' | 'compact';
}

function clamp(v: number, min?: number, max?: number): number {
  let n = v;
  if (min !== undefined) n = Math.max(min, n);
  if (max !== undefined) n = Math.min(max, n);
  return n;
}

// Keeps repeated +/- nudges on a fractional step (e.g. 0.5) from drifting
// into floating-point noise (0.1 + 0.2 !== 0.3), rounded to that step's own
// decimal precision rather than a fixed count.
function roundToStep(v: number, step: number): number {
  const decimals = (step.toString().split('.')[1] || '').length;
  return Number(v.toFixed(decimals));
}

// Sleeper-style mobile row (label/description left, pill stepper right) —
// the desktop view below sm: keeps this app's existing label+number-input
// look untouched, so only the mobile layout changes.
export function ScoreField({
  label, description, value, onChange, step = 1, min, max, variant = 'default',
}: ScoreFieldProps) {
  const id = useId();
  const nudge = (delta: number) => onChange(clamp(roundToStep(value + delta, step), min, max));
  const atMin = min !== undefined && value <= min;
  const atMax = max !== undefined && value >= max;

  // The desktop input keeps its own text so a cleared field or a lone "-"
  // (typing a negative) isn't coerced to 0 mid-keystroke. It commits to the
  // parent only when the text parses, and snaps back to the real value on
  // blur if it doesn't.
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const commit = (raw: string) => {
    setText(raw);
    const n = parseFloat(raw);
    if (!Number.isNaN(n)) onChange(clamp(n, min, max));
  };

  const stepBtn = 'w-8 h-8 rounded-full flex items-center justify-center text-turf-300 hover:bg-turf-700 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-field-400';

  return (
    <div className="w-full">
      {/* Mobile row */}
      <div className="sm:hidden flex items-center justify-between gap-3 py-3 border-b border-turf-800 last:border-b-0">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white" id={`${id}-m`}>{label}</p>
          {description && <p className="text-xs text-turf-500 mt-0.5">{description}</p>}
        </div>
        <div className="flex items-center gap-0.5 bg-turf-800 border border-turf-600 rounded-full p-0.5 flex-shrink-0" role="group" aria-labelledby={`${id}-m`}>
          <button type="button" onClick={() => nudge(-step)} disabled={atMin} aria-label={`Decrease ${label}`} className={stepBtn}>
            <Minus className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <span className="w-10 text-center font-mono font-semibold text-white text-sm tabular-nums" aria-live="polite">
            {value}
          </span>
          <button type="button" onClick={() => nudge(step)} disabled={atMax} aria-label={`Increase ${label}`} className={stepBtn}>
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Desktop — unchanged existing look */}
      <div className="hidden sm:block">
        {variant === 'compact' ? (
          <label htmlFor={id} className="text-xs text-turf-500 uppercase tracking-wide block mb-1">{label}</label>
        ) : (
          <label htmlFor={id} className="label">{label}</label>
        )}
        <input
          id={id}
          name={id}
          className={`input font-mono tabular-nums ${variant === 'compact' ? 'text-center' : ''}`}
          type="number"
          inputMode="decimal"
          autoComplete="off"
          step={step}
          min={min}
          max={max}
          value={text}
          onChange={e => commit(e.target.value)}
          onBlur={() => setText(String(value))}
        />
        {description && <p className="text-xs text-turf-500 mt-0.5">{description}</p>}
      </div>
    </div>
  );
}
