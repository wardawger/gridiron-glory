import type { ReactNode } from 'react';
import { useDialog } from '../../hooks/useDialog';

interface Props {
  onClose: () => void;
  // id of the element that names the dialog (usually its heading)
  labelledBy: string;
  // Extra classes for the panel — border color etc. Base sizing/shape is fixed.
  panelClassName?: string;
  // When true, backdrop clicks are ignored (e.g. while a request is in flight)
  locked?: boolean;
  zIndexClass?: string;
  children: ReactNode;
}

// Backdrop + panel for the app's confirmation-style modals, with the
// accessible-dialog behaviour from useDialog (focus, Tab trap, Escape,
// scroll lock, focus restore) applied once here instead of per modal.
export function DialogShell({ onClose, labelledBy, panelClassName = '', locked = false, zIndexClass = 'z-[70]', children }: Props) {
  const panelRef = useDialog(() => { if (!locked) onClose(); });
  return (
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center p-4`}
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={() => { if (!locked) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`relative w-full max-w-sm rounded-2xl border bg-turf-950 shadow-2xl p-6 space-y-4 overscroll-contain focus:outline-none ${panelClassName}`}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
