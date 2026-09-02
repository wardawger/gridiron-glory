import { useEffect, useRef, useState } from 'react';

const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

// State + keyboard handling for a custom dropdown menu (WAI-ARIA menu
// button pattern). The caller renders the trigger with
// `aria-haspopup="menu"` / `aria-expanded={open}`, the popup with
// `role="menu"` and `ref={menuRef}`, and each option with a menuitem role.
// This handles: outside-click and Escape to close (Escape returns focus to
// the trigger), moving focus into the menu on open (to the checked item if
// there is one), and Arrow / Home / End navigation between items.
export function useDropdownMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    const menu = menuRef.current;

    const items = () => Array.from(menu?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
    const trigger = () => root?.querySelector<HTMLElement>('[aria-haspopup]') ?? null;

    const initial = menu?.querySelector<HTMLElement>('[aria-checked="true"]') ?? items()[0];
    initial?.focus();

    const onMouseDown = (e: MouseEvent) => {
      if (root && !root.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        trigger()?.focus();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
      const els = items();
      if (els.length === 0) return;
      e.preventDefault();
      const i = els.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === 'Home' ? 0 :
        e.key === 'End'  ? els.length - 1 :
        e.key === 'ArrowDown' ? (i + 1) % els.length :
        (i - 1 + els.length) % els.length;
      els[next].focus();
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return { open, setOpen, rootRef, menuRef };
}
