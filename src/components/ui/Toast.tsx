import { CheckCircle2 } from 'lucide-react';

interface Props {
  message: string;
  show: boolean;
}

// The live region stays mounted (empty when hidden) so screen readers
// announce the message when it appears — a region that mounts and speaks in
// the same tick is often missed.
export function Toast({ message, show }: Props) {
  return (
    <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
      {show && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-field-800/50 bg-turf-900 shadow-2xl shadow-black/50 text-sm text-white animate-slide-up motion-reduce:animate-none">
          <CheckCircle2 className="w-4 h-4 text-field-400 flex-shrink-0" aria-hidden="true" />
          {message}
        </div>
      )}
    </div>
  );
}
