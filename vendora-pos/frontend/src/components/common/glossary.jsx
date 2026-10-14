import React from 'react';
import Abbr from './Abbr';

// Shared glossary expander for data-driven copy (tool taglines, compliance notes, etc.) where the acronym
// lives in a plain string rather than JSX. `withGlossary(text)` returns the text with the FIRST occurrence of
// each known acronym wrapped in <Abbr> (native <abbr title> tooltip + screen-reader expansion); later repeats
// in the same string are left alone so the copy doesn't get noisy. Pass plain strings only.
const TERMS = ['MTD', 'MUP', 'MHRA', 'FSA', 'PPDS', 'HACCP', 'SFBB'];
const RE = new RegExp(`\\b(${TERMS.join('|')})\\b`, 'g');

export function withGlossary(text) {
  if (text == null || typeof text !== 'string') return text;
  const seen = new Set();
  const out = [];
  let last = 0;
  let key = 0;
  let m;
  RE.lastIndex = 0;
  while ((m = RE.exec(text))) {
    const term = m[1];
    if (seen.has(term)) continue; // only the first mention is expanded
    seen.add(term);
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<Abbr key={key++} term={term}>{term}</Abbr>);
    last = m.index + term.length;
  }
  if (out.length === 0) return text;
  if (last < text.length) out.push(text.slice(last));
  return out;
}
