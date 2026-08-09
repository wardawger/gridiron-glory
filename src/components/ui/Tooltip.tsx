import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  width?: string; // e.g. 'w-48', 'w-64'
  fullWidth?: boolean; // stretch to fill the parent instead of shrinking to content width — for wrapping a w-full row in a block/list layout
  // Opt-in: tapping the trigger opens the tooltip (needed since touch has no
  // hover). Off by default because most Tooltip usages wrap an element with
  // its own real click action (a draft card, a "view schedule" button) —
  // turning every tap into "also open the tooltip" would fight that action.
  // InfoTooltip's little (i) icon has no other purpose, so it opts in.
  clickToOpen?: boolean;
}

/**
 * Stylized tooltip matching the Roster Analytics metric tooltips.
 * Wraps any child element — on hover shows a dark card with arrow.
 *
 * Usage:
 *   <Tooltip content="Explanation text here">
 *     <span>Hover me</span>
 *   </Tooltip>
 */
export function Tooltip({ content, children, position = 'bottom', width = 'w-56', fullWidth = false, clickToOpen = false }: TooltipProps) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Hide on scroll or click outside
  useEffect(() => {
    if (!show) return;
    const hide = () => setShow(false);
    window.addEventListener('scroll', hide, { passive: true });
    window.addEventListener('click', hide);
    return () => {
      window.removeEventListener('scroll', hide);
      window.removeEventListener('click', hide);
    };
  }, [show]);

  const positionClasses = {
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    top:    'bottom-full mb-2 left-1/2 -translate-x-1/2',
    left:   'right-full mr-2 top-1/2 -translate-y-1/2',
    right:  'left-full ml-2 top-1/2 -translate-y-1/2',
  };

  const arrowClasses = {
    bottom: 'bottom-full left-1/2 -translate-x-1/2 mb-[-1px] border-l border-t border-turf-600 rotate-45',
    top:    'top-full left-1/2 -translate-x-1/2 mt-[-1px] border-r border-b border-turf-600 rotate-45',
    left:   'left-full top-1/2 -translate-y-1/2 ml-[-1px] border-r border-t border-turf-600 rotate-45',
    right:  'right-full top-1/2 -translate-y-1/2 mr-[-1px] border-l border-b border-turf-600 rotate-45',
  };

  return (
    <div
      ref={ref}
      className={`relative ${fullWidth ? 'flex w-full' : 'inline-flex'}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      // Touch devices fire a click but no hover events at all — without this,
      // tapping the trigger on mobile would never open the tooltip in the
      // first place. stopPropagation keeps this same tap from immediately
      // re-triggering the window click-listener below and closing it again.
      onClick={clickToOpen ? e => { e.stopPropagation(); setShow(true); } : undefined}
    >
      {children}
      {show && (
        <div className={`absolute ${positionClasses[position]} z-50 ${width} pointer-events-none`}>
          {/* Arrow */}
          <div className={`absolute w-2 h-2 bg-turf-800 ${arrowClasses[position]}`} />
          {/* Card */}
          <div className="relative bg-turf-800 border border-turf-600 rounded-lg px-3 py-2.5 shadow-xl shadow-black/50">
            {/* Close button — mobile only, since touch has no hover-to-dismiss */}
            <button
              onClick={e => { e.stopPropagation(); setShow(false); }}
              aria-label="Close"
              className="sm:hidden absolute top-1.5 right-1.5 rounded p-0.5 text-turf-400 hover:text-white transition-colors pointer-events-auto"
            >
              <X className="w-3 h-3" />
            </button>
            <p className="text-xs text-turf-200 leading-relaxed pr-4 sm:pr-0">{content}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Icon-only trigger — a small ⓘ circle that shows a tooltip on hover.
 * Drop-in replacement for plain `title=` on info icons.
 */
export function InfoTooltip({ content, position = 'bottom', width = 'w-56' }: {
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  width?: string;
}) {
  return (
    <Tooltip content={content} position={position} width={width} clickToOpen>
      <button
        type="button"
        aria-label="More info"
        className="w-3.5 h-3.5 rounded-full bg-turf-700 text-turf-400 text-xs flex items-center justify-center flex-shrink-0 hover:bg-turf-600 hover:text-white transition-colors select-none"
      >
        i
      </button>
    </Tooltip>
  );
}
