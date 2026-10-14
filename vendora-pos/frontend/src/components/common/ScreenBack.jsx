import React from 'react';
import { ChevronLeft } from 'lucide-react';

/**
 * Standard sub-screen back control (flows audit, 375px). A single >= 44px-tall tap target with a chevron and a
 * fixed aria-label="Back", so every sub-screen's back affordance is consistent and reachable (the old inline
 * "Home" links were ~20px tall). `label` is the visible word (e.g. "Home", "Back to counting"); the accessible
 * name stays "Back".
 */
export default function ScreenBack({ onBack, label = 'Back', className = '' }) {
  return (
    <button
      type="button"
      onClick={onBack}
      aria-label={label}
      className={`mb-3 -ml-2 inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary hover:underline active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
    >
      <ChevronLeft className="h-5 w-5" /> {label}
    </button>
  );
}
