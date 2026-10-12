import React from 'react';
import { ExternalLink } from 'lucide-react';

// A shared footer for every compliance tool/deadline: when the figures were last checked against the primary
// source, and a link to that source. Keeps the "it's only a guide — here's the official word" promise explicit
// and in one place. `verified` is an ISO date string; `href`/`label` point at the official guidance.
export default function ComplianceNote({ verified, href, label = 'Official guidance', children }) {
  const when = verified ? new Date(verified).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  return (
    <p className="mt-4 text-xs leading-snug text-gray-400">
      {children}
      {children ? ' ' : ''}
      {when && <>Last verified {when}. </>}
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary underline">
          {label}<ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      )}
    </p>
  );
}
