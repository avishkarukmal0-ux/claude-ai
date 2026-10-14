import React from 'react';
import { ExternalLink } from 'lucide-react';

// A shared footer for every compliance tool/deadline: when the figures were last checked against the primary
// source, and a link to that source. Keeps the "it's only a guide — here's the official word" promise explicit
// and in one place. `verified` is an ISO date string; `href`/`label` point at the official guidance.
export default function ComplianceNote({ verified, href, label = 'Official guidance', children }) {
  const when = verified ? new Date(verified).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  return (
    <div className="mt-4 text-xs leading-snug text-gray-400">
      {(children || when) && (
        <p>
          {children}
          {children ? ' ' : ''}
          {when && <>Last verified {when}.</>}
        </p>
      )}
      {href && (
        // The source link is its own ≥44px tappable row (WCAG 2.5.8) with 12px text — not a tiny inline link.
        <a href={href} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-[44px] items-center gap-1 font-medium text-primary underline">
          {label}<ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
