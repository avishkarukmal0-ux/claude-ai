import React from 'react';
import { useDialog } from '../../lib/useDialog';

/**
 * Accessible confirm dialog — a real modal (role="dialog", aria-modal, focus-trapped, Escape/overlay to cancel)
 * to replace window.confirm for destructive actions. `tone="danger"` styles the confirm button red.
 */
export default function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'default', onConfirm, onCancel }) {
  const ref = useDialog(open, onCancel);
  if (!open) return null;
  const confirmCls = tone === 'danger' ? 'bg-danger text-white' : 'bg-primary text-white';
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onCancel}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-t-3xl bg-white p-4 shadow-xl sm:rounded-3xl">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        {message && <p className="mt-1 text-sm text-gray-500">{message}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-gray-100 px-3 text-sm font-semibold text-gray-700">{cancelLabel}</button>
          <button type="button" onClick={onConfirm} className={`inline-flex min-h-[44px] items-center justify-center rounded-xl px-3 text-sm font-semibold ${confirmCls}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
