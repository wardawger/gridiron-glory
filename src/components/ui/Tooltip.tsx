import { useState, useRef, useEffect, useLayoutEffect, useId } from 'react';
import { createPortal } from 'react-dom';
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

type Side = 'top' | 'bottom' | 'left' | 'right';
interface Coords { top: number; left: number; arrowLeft: number; arrowTop: number; side: Side; }

/**
 * Stylized tooltip matching the Roster Analytics metric tooltips.
 * Wraps any child element — on hover shows a dark card with arrow.
 *
 * The floating card renders through a portal into document.body rather
 * than as a normal absolutely-positioned child. Several call sites live
 * inside `overflow-hidden`/`overflow-x-auto` table wrappers (e.g. the
 * Roster Analytics table) — CSS overflow clips any descendant that pokes
 * outside that ancestor's box regardless of its own position, so a plain
 * absolute child gets cut off there no matter how its offsets are tuned.
 * Escaping via a portal + real viewport pixel coordinates is the only fix
 * that isn't a fragile per-page patch.
 *
 * Usage:
 *   <Tooltip content="Explanation text here">
 *     <span>Hover me</span>
 *   </Tooltip>
 */
export function Tooltip({ content, children, position = 'bottom', width = 'w-56', fullWidth = false, clickToOpen = false }: TooltipProps) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const contentId = useId();

  // Hide on scroll, click outside, or Escape
  useEffect(() => {
    if (!show) return;
    const hide = () => setShow(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShow(false); };
    window.addEventListener('scroll', hide, { passive: true });
    window.addEventListener('click', hide);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', hide);
      window.removeEventListener('click', hide);
      window.removeEventListener('keydown', onKey);
    };
  }, [show]);

  // Measure the trigger and the (already-mounted, off-screen on this first
  // pass) card, then compute real viewport coordinates clamped within an
  // 8px margin. Runs before paint, so the off-screen starting position
  // never actually flashes on screen.
  useLayoutEffect(() => {
    if (!show) { setCoords(null); return; }
    const trigger = ref.current;
    const card = cardRef.current;
    if (!trigger || !card) return;

    const t = trigger.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const gap = 8;
    const margin = 8;

    // Flip to the opposite side when the preferred one doesn't actually
    // fit — otherwise the later clamp shoves the card back on-screen while
    // it's still visually "attached" to the wrong edge, leaving the arrow
    // pointing at empty space instead of the trigger (e.g. a trigger near
    // the bottom of a tall table with position="bottom" and no room below).
    let side: Side = position;
    if (position === 'bottom' && t.bottom + gap + c.height > window.innerHeight - margin
        && t.top - gap - c.height >= margin) {
      side = 'top';
    } else if (position === 'top' && t.top - gap - c.height < margin
        && t.bottom + gap + c.height <= window.innerHeight - margin) {
      side = 'bottom';
    } else if (position === 'right' && t.right + gap + c.width > window.innerWidth - margin
        && t.left - gap - c.width >= margin) {
      side = 'left';
    } else if (position === 'left' && t.left - gap - c.width < margin
        && t.right + gap + c.width <= window.innerWidth - margin) {
      side = 'right';
    }

    let top = 0;
    let left = 0;
    if (side === 'bottom') {
      top  = t.bottom + gap;
      left = t.left + t.width / 2 - c.width / 2;
    } else if (side === 'top') {
      top  = t.top - gap - c.height;
      left = t.left + t.width / 2 - c.width / 2;
    } else if (side === 'left') {
      top  = t.top + t.height / 2 - c.height / 2;
      left = t.left - gap - c.width;
    } else {
      top  = t.top + t.height / 2 - c.height / 2;
      left = t.right + gap;
    }

    left = Math.min(Math.max(left, margin), window.innerWidth - c.width - margin);
    top  = Math.min(Math.max(top, margin), window.innerHeight - c.height - margin);

    // Arrow offset is relative to the card's own edge, so it must be derived
    // from the FINAL (possibly clamped) position — computing it from the
    // pre-clamp position points it at where the card would have been, not
    // where it actually landed. Also kept within the card's own bounds so a
    // large clamp shift can't push the arrow off the card entirely.
    const arrowLeft = Math.min(Math.max(t.left + t.width / 2 - left, 12), c.width - 12);
    const arrowTop  = Math.min(Math.max(t.top + t.height / 2 - top, 12), c.height - 12);

    setCoords({ top, left, arrowLeft, arrowTop, side });
  }, [show, position]);

  return (
    <div
      ref={ref}
      className={`relative ${fullWidth ? 'flex w-full' : 'inline-flex'}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      // Keyboard users reach the trigger via Tab, never hover — open on
      // focus, close when focus leaves the trigger subtree.
      onFocus={() => setShow(true)}
      onBlur={e => { if (!ref.current?.contains(e.relatedTarget as Node | null)) setShow(false); }}
      aria-describedby={show ? contentId : undefined}
      // Touch devices fire a click but no hover events at all — without this,
      // tapping the trigger on mobile would never open the tooltip in the
      // first place. stopPropagation keeps this same tap from immediately
      // re-triggering the window click-listener below and closing it again.
      onClick={clickToOpen ? e => { e.stopPropagation(); setShow(true); } : undefined}
    >
      {children}
      {show && createPortal(
        <div
          className={`fixed z-50 ${width} pointer-events-none`}
          style={{ top: coords?.top ?? -9999, left: coords?.left ?? -9999 }}
        >
          {/* Arrow — anchored to the card's resolved side, not the requested
              position prop, since flipping (above) can make them differ */}
          {coords && (coords.side === 'top' || coords.side === 'bottom') && (
            <div
              className={`absolute w-2 h-2 bg-turf-800 border-turf-600 rotate-45 ${
                coords.side === 'bottom' ? 'border-l border-t' : 'border-r border-b'
              }`}
              style={{ left: coords.arrowLeft - 4, ...(coords.side === 'bottom' ? { top: -4 } : { bottom: -4 }) }}
            />
          )}
          {coords && (coords.side === 'left' || coords.side === 'right') && (
            <div
              className={`absolute w-2 h-2 bg-turf-800 border-turf-600 rotate-45 ${
                coords.side === 'left' ? 'border-r border-t' : 'border-l border-b'
              }`}
              style={{ top: coords.arrowTop - 4, ...(coords.side === 'left' ? { right: -4 } : { left: -4 }) }}
            />
          )}
          {/* Card */}
          <div ref={cardRef} role="tooltip" id={contentId} className="relative bg-turf-800 border border-turf-600 rounded-lg px-3 py-2.5 shadow-xl shadow-black/50">
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
        </div>,
        document.body
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
      {/* 24px hit target (negative margin keeps the visual 14px dot from
          shifting the surrounding layout) around the small ⓘ glyph. */}
      <button
        type="button"
        aria-label="More info"
        className="group w-6 h-6 -m-[5px] rounded-full flex items-center justify-center flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-field-400"
      >
        <span aria-hidden="true" className="w-3.5 h-3.5 rounded-full bg-turf-700 text-turf-400 text-xs flex items-center justify-center group-hover:bg-turf-600 group-hover:text-white transition-colors select-none">
          i
        </span>
      </button>
    </Tooltip>
  );
}
