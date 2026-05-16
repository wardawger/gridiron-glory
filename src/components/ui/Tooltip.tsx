import { useState, useRef, useEffect } from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  width?: string; // e.g. 'w-48', 'w-64'
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
export function Tooltip({ content, children, position = 'bottom', width = 'w-56' }: TooltipProps) {
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
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className={`absolute ${positionClasses[position]} z-50 ${width} pointer-events-none`}>
          {/* Arrow */}
          <div className={`absolute w-2 h-2 bg-turf-800 ${arrowClasses[position]}`} />
          {/* Card */}
          <div className="bg-turf-800 border border-turf-600 rounded-lg px-3 py-2.5 shadow-xl shadow-black/50">
            <p className="text-xs text-turf-200 leading-relaxed">{content}</p>
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
    <Tooltip content={content} position={position} width={width}>
      <span className="w-3.5 h-3.5 rounded-full bg-turf-700 text-turf-400 text-xs flex items-center justify-center flex-shrink-0 hover:bg-turf-600 hover:text-white transition-colors cursor-default select-none">
        i
      </span>
    </Tooltip>
  );
}
