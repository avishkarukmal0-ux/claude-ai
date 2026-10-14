import React from 'react';

// Spell out the UK-retail acronyms shopkeepers shouldn't be expected to know. We EXPAND IN TEXT on first
// mention — "Full term (ACRONYM)" — rather than relying on an <abbr title> tooltip, because title tooltips
// never appear on touch devices (phones/tablets), which is most of the shop floor. The glossary helper
// (withGlossary) only wraps the first mention per string, so the long form isn't repeated.
const TERMS = {
  MTD: 'Making Tax Digital',
  MUP: 'Minimum Unit Pricing',
  MHRA: 'Medicines and Healthcare products Regulatory Agency',
  FSA: 'Food Standards Agency',
  PPDS: 'Prepacked for Direct Sale',
  HACCP: 'Hazard Analysis and Critical Control Points',
  SFBB: 'Safer Food, Better Business',
};

export default function Abbr({ term, children }) {
  const acronym = children || term;
  const full = TERMS[term];
  // Unknown acronym → leave the text untouched. Known → expand inline, keeping the short form in brackets so
  // the reader still sees the familiar acronym. Plain text only, so it's safe inside buttons/links/headings.
  return full ? <>{full} ({acronym})</> : <>{acronym}</>;
}
