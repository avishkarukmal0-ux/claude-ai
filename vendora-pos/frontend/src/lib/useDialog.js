// Accessible modal-dialog behaviour (audit FE8). A `role="dialog" aria-modal="true"` overlay must also:
//   • close on Escape,
//   • trap Tab focus inside it (so keyboard/screen-reader users can't tab out into the page behind it),
//   • move focus into it on open, and restore focus to whatever opened it on close.
// Returns a ref to put on the dialog's content element. `active` toggles the behaviour; `onClose` fires on Escape.
import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]', 'area[href]', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', 'button:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useDialog(active, onClose) {
  const ref = useRef(null);
  // Keep the latest onClose without making the effect re-run (and re-grab focus) on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return undefined;
    const node = ref.current;
    const previouslyFocused = (typeof document !== 'undefined' && document.activeElement) || null;
    const focusables = () => (node ? [...node.querySelectorAll(FOCUSABLE)] : []);

    // Move focus into the dialog (first focusable, else the dialog itself).
    const first = focusables()[0];
    if (first) { try { first.focus(); } catch { /* ignore */ } }
    else if (node) { node.setAttribute('tabindex', '-1'); try { node.focus(); } catch { /* ignore */ } }

    const onKeyDown = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current?.(); return; }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) { e.preventDefault(); return; }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey && (activeEl === firstEl || activeEl === node)) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && activeEl === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        try { previouslyFocused.focus(); } catch { /* ignore */ }
      }
    };
  }, [active]);

  return ref;
}
