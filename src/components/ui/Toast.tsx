import { CheckCircle2 } from 'lucide-react';

interface Props {
  message: string;
  show: boolean;
}

export function Toast({ message, show }: Props) {
  if (!show) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-slide-up pointer-events-none">
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-field-800/50 bg-turf-900 shadow-2xl shadow-black/50 text-sm text-white">
        <CheckCircle2 className="w-4 h-4 text-field-400 flex-shrink-0" />
        {message}
      </div>
    </div>
  );
}
