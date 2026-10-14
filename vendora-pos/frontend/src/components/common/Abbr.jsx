import React from 'react';

// Spell out the UK-retail acronyms shopkeepers shouldn't be expected to know. Renders a native <abbr> so the
// full term shows on hover/long-press and is read out by screen readers, with a dotted underline as the hint.
const TERMS = {
  MTD: 'Making Tax Digital',
  MUP: 'Minimum Unit Pricing',
  MHRA: 'Medicines and Healthcare products Regulatory Agency',
  FSA: 'Food Standards Agency',
  PPDS: 'Prepacked for Direct Sale',
};

export default function Abbr({ term, children }) {
  const title = TERMS[term] || term;
  return (
    <abbr title={title} className="cursor-help font-[inherit] no-underline [text-decoration:underline_dotted] underline-offset-2">
      {children || term}
    </abbr>
  );
}
