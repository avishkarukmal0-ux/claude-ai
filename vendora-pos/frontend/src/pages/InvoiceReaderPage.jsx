import React, { useState, useRef, useCallback, useEffect } from 'react';
import api from '../services/api';
import * as marginSvc from '../services/margins';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

// ── Margin helpers (client-side calc, mirrors marginService.js) ───────────────
function calcSuggestedRetail(cost, rule) {
  if (!cost || !rule) return null;
  const { targetMargin = 30, minMargin = 15, vatRate = 20 } = rule;
  const vat = vatRate / 100;
  const calcInc = (m) => {
    if (m >= 100) return cost * (1 + vat);
    return Math.ceil((cost / (1 - m / 100)) * (1 + vat) * 20) / 20;
  };
  const suggested = calcInc(targetMargin);
  const minRetail = calcInc(minMargin);
  const excVat = suggested / (1 + vat);
  const actualMargin = excVat > 0 ? (excVat - cost) / excVat * 100 : 0;
  return { suggested, minRetail, actualMargin: Math.round(actualMargin * 10) / 10, targetMargin, minMargin };
}

function getRule(settings, category) {
  if (!settings) return { targetMargin: 30, minMargin: 15, maxMargin: 0, vatRate: 20 };
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cats = settings.categories || [];
  let match = cats.find(c => norm(c.name) === norm(category || ''));
  if (!match) match = cats.find(c => norm(category || '').includes(norm(c.name)) || norm(c.name).includes(norm(category || '')));
  return match || { targetMargin: settings.defaultMargin || 30, minMargin: Math.round((settings.defaultMargin || 30) * 0.6), maxMargin: 0, vatRate: 20 };
}

function marginStatusColor(currentRetail, newCost, rule) {
  if (!currentRetail || !newCost || !rule) return 'gray';
  const { minMargin = 15, vatRate = 20 } = rule;
  const excVat = currentRetail / (1 + vatRate / 100);
  const actual = excVat > 0 ? (excVat - newCost) / excVat * 100 : 0;
  if (actual < minMargin)           return 'red';
  if (actual < minMargin * 1.2)     return 'amber';
  return 'green';
}

const fmt = (n) => n != null ? `£${Number(n).toFixed(2)}` : '—';
const pct = (n) => n != null ? `${n > 0 ? '+' : ''}${Number(n).toFixed(1)}%` : '—';

// ── Summary stat card ────────────────────────────────────────────────────────
function StatCard({ label, value, color = 'blue' }) {
  const colors = {
    blue:   { bg: 'rgba(37,99,235,0.10)',  text: 'var(--blue-light)' },
    green:  { bg: 'rgba(22,163,74,0.10)',  text: 'var(--green-light)' },
    red:    { bg: 'rgba(220,38,38,0.10)',  text: '#F87171' },
    amber:  { bg: 'rgba(217,119,6,0.10)',  text: '#FCD34D' },
    purple: { bg: 'rgba(124,58,237,0.10)', text: '#A78BFA' },
  };
  const c = colors[color] || colors.blue;
  return (
    <div style={{ background: c.bg, borderRadius: 10, padding: '12px 16px', textAlign: 'center', minWidth: 100 }}>
      <p style={{ fontSize: 22, fontWeight: 700, color: c.text, lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
    </div>
  );
}

// ── Match confidence badge ────────────────────────────────────────────────────
function ConfidenceBadge({ confidence, method, isNew }) {
  if (isNew) return <span style={{ background: 'rgba(124,58,237,0.15)', color: '#A78BFA', padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>NEW PRODUCT</span>;
  if (method === 'none') return <span style={{ background: 'rgba(217,119,6,0.15)', color: '#FCD34D', padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>NO MATCH</span>;
  const pctVal = Math.round((confidence || 0) * 100);
  const color = pctVal >= 90 ? '#4ADE80' : pctVal >= 75 ? '#FCD34D' : '#F87171';
  const bg = pctVal >= 90 ? 'rgba(74,222,128,0.12)' : pctVal >= 75 ? 'rgba(252,211,77,0.12)' : 'rgba(248,113,113,0.12)';
  const label = method === 'barcode' ? 'Barcode' : method === 'manual' ? 'Manual' : `${pctVal}% match`;
  return <span style={{ background: bg, color, padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>{label}</span>;
}

// ── Price change cell ─────────────────────────────────────────────────────────
function PriceChangeCell({ item }) {
  if (!item.priceChanged) {
    return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No change</span>;
  }
  const isUp = item.changeDirection === 'up';
  const color = isUp ? '#F87171' : '#4ADE80';
  return (
    <div>
      <span style={{ color, fontWeight: 700, fontSize: 12 }}>{isUp ? '▲' : '▼'} {pct(item.changePercent)}</span>
      {item.marginWarning && (
        <p style={{ fontSize: 10, color: '#FCD34D', marginTop: 2 }}>⚠ Margin {item.marginAfter?.toFixed(0)}%</p>
      )}
    </div>
  );
}

// ── Row left border by status ─────────────────────────────────────────────────
function rowBorder(item) {
  if (item.isNewProduct) return '3px solid rgba(124,58,237,0.6)';
  if (item.changeDirection === 'up') return '3px solid rgba(220,38,38,0.6)';
  if (item.changeDirection === 'down') return '3px solid rgba(22,163,74,0.6)';
  if (item.matchMethod === 'none') return '3px solid rgba(217,119,6,0.6)';
  return '3px solid transparent';
}

// ── Manual match search ───────────────────────────────────────────────────────
function ManualMatchInput({ invoiceId, itemIndex, onMatched }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await api.get('/products', { params: { search: query.trim(), active: true, limit: 8 } });
      setResults(res.products || []);
    } catch { toast.error('Search failed'); }
    finally { setLoading(false); }
  };

  const assign = async (productId) => {
    try {
      const res = await api.put(`/invoice-reader/${invoiceId}/item/${itemIndex}/match`, { productId });
      toast.success('Product matched');
      setResults([]);
      setQuery('');
      onMatched(res.invoice);
    } catch { toast.error('Match failed'); }
  };

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="vd-input"
          style={{ flex: 1, fontSize: 11, padding: '4px 8px', height: 28 }}
          placeholder="Search products..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
        />
        <button onClick={search} style={{
          background: 'var(--blue)', color: '#fff', border: 'none',
          borderRadius: 6, padding: '0 10px', fontSize: 11, cursor: 'pointer',
        }}>{loading ? '…' : 'Find'}</button>
      </div>
      {results.length > 0 && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, marginTop: 4, maxHeight: 160, overflowY: 'auto' }}>
          {results.map(p => (
            <button key={p._id} onClick={() => assign(p._id)} style={{
              width: '100%', textAlign: 'left', background: 'none', border: 'none',
              padding: '6px 10px', cursor: 'pointer', color: 'var(--text-secondary)',
              fontSize: 11, borderBottom: '1px solid var(--border)',
            }}>
              {p.name} <span style={{ color: 'var(--text-muted)' }}>· {p.barcode}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Review table ─────────────────────────────────────────────────────────────
function ReviewTable({ invoice, onUpdate }) {
  const [toggles, setToggles] = useState(() => {
    const t = {};
    invoice.items.forEach((it, i) => { t[i] = it.applyUpdate; });
    return t;
  });
  const [retailToggles, setRetailToggles] = useState({});
  const [retailInputs, setRetailInputs] = useState({});
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [applying, setApplying] = useState(false);
  const [marginSettings, setMarginSettings] = useState(null);

  useEffect(() => {
    marginSvc.getMarginSettings().then(r => setMarginSettings(r.settings)).catch(() => {});
  }, []);

  const matched = invoice.items.map((it, i) => ({ ...it, _idx: i })).filter(it => it.matchMethod !== 'none');
  const unmatched = invoice.items.map((it, i) => ({ ...it, _idx: i })).filter(it => it.matchMethod === 'none');

  const handleToggle = (i) => setToggles(prev => ({ ...prev, [i]: !prev[i] }));
  const handleRetailToggle = (i) => setRetailToggles(prev => ({ ...prev, [i]: !prev[i] }));

  // Count items with retail status RED
  const redItems = matched.filter(item => {
    if (!item.priceChanged) return false;
    const category = item.matchedProduct?.category || '';
    const rule = getRule(marginSettings, category);
    const currentRetail = item.matchedProduct?.pricing?.retailPrice;
    return marginStatusColor(currentRetail, item.unitCost, rule) === 'red';
  });

  const handleApply = async () => {
    setApplying(true);
    const approvedItems = Object.entries(toggles).map(([idx, apply]) => ({
      itemIndex:        Number(idx),
      applyUpdate:      apply,
      applyRetailUpdate: !!retailToggles[idx],
      newRetailPrice:   retailInputs[idx] ? parseFloat(retailInputs[idx]) : undefined,
    }));
    try {
      const res = await api.post(`/invoice-reader/${invoice._id}/apply`, { approvedItems });
      const { applied, retailUpdated, marginsBreached } = res;
      toast.success(`Applied ${applied} cost update${applied !== 1 ? 's' : ''}${retailUpdated ? ` + ${retailUpdated} retail price${retailUpdated !== 1 ? 's' : ''}` : ''}`);
      if (marginsBreached?.length) {
        toast(`⚠ ${marginsBreached.length} product${marginsBreached.length !== 1 ? 's' : ''} still below minimum margin`, { duration: 6000 });
      }
      onUpdate(res.invoice);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Apply failed');
    } finally { setApplying(false); }
  };

  const toggleAll = (val) => {
    const next = {};
    invoice.items.forEach((_, i) => { next[i] = val; });
    setToggles(next);
  };

  return (
    <div>
      {/* Summary row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard label="Matched" value={invoice.summary.matchedItems} color="green" />
        <StatCard label="Price ↑" value={invoice.summary.priceIncreases} color="red" />
        <StatCard label="Price ↓" value={invoice.summary.priceDecreases} color="green" />
        <StatCard label="New Products" value={invoice.summary.newProducts} color="purple" />
        <StatCard label="No Match" value={invoice.summary.unmatchedItems} color="amber" />
        <StatCard label="Total Value" value={fmt(invoice.summary.totalValue)} color="blue" />
      </div>

      {/* Red margin alert banner */}
      {redItems.length > 0 && marginSettings?.alertBelowMinMargin !== false && (
        <div style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.35)', borderRadius: 10, padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ fontSize: 16 }}>⚠</span>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#F87171' }}>
              {redItems.length} product{redItems.length !== 1 ? 's' : ''} need retail price updates
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Supplier cost increases have dropped {redItems.length === 1 ? 'it' : 'them'} below your minimum margin. Toggle "Update retail" on these rows.
            </p>
          </div>
        </div>
      )}

      {/* Matched items table */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '10px 14px', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Matched Items ({matched.length})</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => toggleAll(true)} style={{ fontSize: 10, color: 'var(--blue-light)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Select All</button>
            <button onClick={() => toggleAll(false)} style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Deselect All</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Product</th>
              <th style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Match</th>
              <th style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Qty</th>
              <th style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Old Cost</th>
              <th style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>New Cost</th>
              <th style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Change</th>
              {marginSettings?.autoSuggestPrice !== false && <>
                <th style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Target%</th>
                <th style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Suggested Retail</th>
              </>}
              <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Apply</th>
            </tr>
          </thead>
          <tbody>
            {matched.map((item) => {
              const category = item.matchedProduct?.category || '';
              const rule = getRule(marginSettings, category);
              const suggestion = item.priceChanged ? calcSuggestedRetail(item.unitCost, rule) : null;
              const currentRetail = item.matchedProduct?.pricing?.retailPrice;
              const status = item.priceChanged ? marginStatusColor(currentRetail, item.unitCost, rule) : 'gray';
              const statusColor = status === 'red' ? '#F87171' : status === 'amber' ? '#FCD34D' : status === 'green' ? '#4ADE80' : 'var(--text-muted)';
              const statusBg = status === 'red' ? 'rgba(220,38,38,0.08)' : status === 'amber' ? 'rgba(217,119,6,0.06)' : 'transparent';

              return (
              <tr key={item._idx} style={{
                borderLeft: rowBorder(item),
                borderBottom: '1px solid var(--border)',
                background: status === 'red' ? 'rgba(220,38,38,0.04)' : item.marginWarning ? 'rgba(217,119,6,0.04)' : 'transparent',
                opacity: !item.priceChanged && !item.isNewProduct ? 0.6 : 1,
              }}>
                <td style={{ padding: '10px 12px' }}>
                  <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.productName}</p>
                  {item.barcode && <p style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{item.barcode}</p>}
                  {category && <p style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>{category}</p>}
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                  <ConfidenceBadge confidence={item.matchConfidence} method={item.matchMethod} isNew={item.isNewProduct} />
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>{item.quantity}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{fmt(item.previousCost)}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: item.changeDirection === 'up' ? '#F87171' : item.changeDirection === 'down' ? '#4ADE80' : 'var(--text-primary)' }}>{fmt(item.unitCost)}</td>
                <td style={{ padding: '10px 8px', textAlign: 'center' }}><PriceChangeCell item={item} /></td>

                {/* Margin columns — only shown when autoSuggestPrice is on */}
                {marginSettings?.autoSuggestPrice !== false && <>
                  <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                    {suggestion ? (
                      <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, background: statusBg, padding: '2px 6px', borderRadius: 6 }}>
                        {suggestion.targetMargin}%
                      </span>
                    ) : <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', minWidth: 120 }}>
                    {suggestion ? (
                      <div>
                        {retailToggles[item._idx] ? (
                          <input
                            type="number" step="0.01" min="0"
                            style={{ width: 72, border: `1px solid ${statusColor}`, borderRadius: 5, padding: '2px 5px', fontFamily: 'monospace', fontSize: 11, background: 'var(--bg-card)', color: 'var(--text-primary)', textAlign: 'right' }}
                            value={retailInputs[item._idx] !== undefined ? retailInputs[item._idx] : suggestion.suggested}
                            onChange={e => setRetailInputs(p => ({ ...p, [item._idx]: e.target.value }))}
                          />
                        ) : (
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: statusColor }}>
                            {fmt(suggestion.suggested)}
                          </span>
                        )}
                        {currentRetail && (
                          <p style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>
                            current: {fmt(currentRetail)}
                          </p>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                          <input
                            type="checkbox"
                            id={`retail-${item._idx}`}
                            checked={!!retailToggles[item._idx]}
                            onChange={() => handleRetailToggle(item._idx)}
                            style={{ accentColor: statusColor }}
                          />
                          <label htmlFor={`retail-${item._idx}`} style={{ fontSize: 9, color: 'var(--text-muted)', cursor: 'pointer' }}>
                            Update retail
                          </label>
                        </div>
                      </div>
                    ) : <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>—</span>}
                  </td>
                </>}

                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  {item.priceChanged || item.isNewProduct ? (
                    <button
                      onClick={() => handleToggle(item._idx)}
                      style={{
                        width: 36, height: 20, borderRadius: 10,
                        background: toggles[item._idx] ? 'var(--green)' : 'var(--bg-hover)',
                        border: `1px solid ${toggles[item._idx] ? 'var(--green)' : 'var(--border)'}`,
                        cursor: 'pointer', position: 'relative', transition: 'all 0.2s',
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: 2, width: 14, height: 14, borderRadius: '50%',
                        background: '#fff', transition: 'all 0.2s',
                        left: toggles[item._idx] ? 19 : 2,
                      }} />
                    </button>
                  ) : (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>—</span>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* Unmatched items */}
      {unmatched.length > 0 && (
        <div style={{ border: '1px solid rgba(217,119,6,0.3)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
          <button
            onClick={() => setShowUnmatched(p => !p)}
            style={{
              width: '100%', padding: '10px 14px', background: 'rgba(217,119,6,0.08)', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
            }}
          >
            <p style={{ fontSize: 12, fontWeight: 700, color: '#FCD34D' }}>⚠ {unmatched.length} Unmatched Items — manual review needed</p>
            <span style={{ color: '#FCD34D', fontSize: 14 }}>{showUnmatched ? '▲' : '▼'}</span>
          </button>
          {showUnmatched && (
            <div style={{ padding: '0 14px 14px' }}>
              {unmatched.map(item => (
                <div key={item._idx} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{item.productName || item.rawText}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Qty: {item.quantity} · Cost: {fmt(item.unitCost)}</p>
                    </div>
                    <ConfidenceBadge confidence={0} method="none" />
                  </div>
                  <ManualMatchInput
                    invoiceId={invoice._id}
                    itemIndex={item._idx}
                    onMatched={onUpdate}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Margin summary */}
      {marginSettings?.autoSuggestPrice !== false && matched.some(it => it.priceChanged) && (() => {
        const changedItems = matched.filter(it => it.priceChanged);
        const withSuggestions = changedItems.map(item => {
          const rule = getRule(marginSettings, item.matchedProduct?.category || '');
          const sugg = calcSuggestedRetail(item.unitCost, rule);
          const currentRetail = item.matchedProduct?.pricing?.retailPrice;
          const status = marginStatusColor(currentRetail, item.unitCost, rule);
          return { sugg, status, rule };
        });
        const redCount   = withSuggestions.filter(x => x.status === 'red').length;
        const amberCount = withSuggestions.filter(x => x.status === 'amber').length;
        const greenCount = withSuggestions.filter(x => x.status === 'green').length;
        const avgTarget  = Math.round(withSuggestions.reduce((s, x) => s + (x.rule?.targetMargin || 0), 0) / (withSuggestions.length || 1));
        const allToggled = changedItems.filter((_, i) => retailToggles[changedItems[i]._idx]);
        const toUpdate   = Object.values(retailToggles).filter(Boolean).length;

        return (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              Margin Summary — If you apply all suggestions
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              {greenCount > 0 && (
                <span style={{ background: 'rgba(22,163,74,0.12)', color: '#4ADE80', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}>
                  ✓ {greenCount} healthy
                </span>
              )}
              {amberCount > 0 && (
                <span style={{ background: 'rgba(217,119,6,0.12)', color: '#FCD34D', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}>
                  ⚠ {amberCount} near minimum
                </span>
              )}
              {redCount > 0 && (
                <span style={{ background: 'rgba(220,38,38,0.12)', color: '#F87171', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}>
                  ✗ {redCount} below minimum — prices need increasing
                </span>
              )}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Your store's avg target margin for these categories: <strong style={{ color: 'var(--text-secondary)' }}>{avgTarget}%</strong>
              {toUpdate > 0 && <span style={{ marginLeft: 8, color: '#60A5FA' }}>· {toUpdate} retail price{toUpdate !== 1 ? 's' : ''} selected for update</span>}
            </p>
          </div>
        );
      })()}

      {/* Action bar */}
      {invoice.status !== 'applied' && invoice.status !== 'rejected' && (
        <div style={{ display: 'flex', gap: 10, padding: '16px 0' }}>
          <button
            onClick={handleApply}
            disabled={applying || Object.values(toggles).every(v => !v)}
            style={{
              flex: 2, background: 'var(--green)', color: '#fff', border: 'none',
              borderRadius: 10, padding: '12px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              opacity: applying ? 0.7 : 1,
            }}
          >
            {applying ? 'Applying…' : `Apply ${Object.values(toggles).filter(Boolean).length} Selected Updates`}
          </button>
          <button
            onClick={() => { if (window.confirm('Discard this invoice?')) onUpdate({ ...invoice, status: 'rejected' }); }}
            style={{
              flex: 1, background: 'var(--red-dim)', border: '1px solid var(--red-light)',
              color: 'var(--red-light)', borderRadius: 10, padding: '12px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Discard
          </button>
        </div>
      )}

      {invoice.status === 'applied' && (
        <div style={{
          background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.3)',
          borderRadius: 10, padding: '14px 20px', textAlign: 'center', color: 'var(--green-light)',
          fontWeight: 700, fontSize: 14,
        }}>
          ✓ Invoice applied — cost prices updated
        </div>
      )}
    </div>
  );
}

// ── Upload zone ───────────────────────────────────────────────────────────────
function UploadZone({ onUploaded }) {
  const [phase, setPhase] = useState('idle'); // idle | processing | duplicate
  const [progress, setProgress] = useState('');
  const [duplicateInfo, setDuplicateInfo] = useState(null);
  const fileRef = useRef();
  const pdfRef = useRef();
  const videoRef = useRef();
  const canvasRef = useRef();
  const streamRef = useRef();
  const [cameraOpen, setCameraOpen] = useState(false);

  const startCamera = async () => {
    setCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    } catch { toast.error('Camera access denied'); setCameraOpen(false); }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  const capturePhoto = () => {
    const v = videoRef.current; const c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    stopCamera();
    c.toBlob(blob => uploadFile(new File([blob], 'invoice.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.85);
  };

  const uploadFile = async (file) => {
    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    const endpoint = isPdf ? '/invoice-reader/scan-pdf' : '/invoice-reader/scan-image';
    setPhase('processing');
    setProgress(isPdf ? 'Extracting text from PDF…' : 'AI is reading your invoice…');
    const form = new FormData();
    form.append('invoice', file);
    try {
      setProgress('Matching products to your inventory…');
      const res = await api.post(endpoint, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.duplicate) {
        setDuplicateInfo(res);
        setPhase('duplicate');
        return;
      }
      setPhase('idle');
      onUploaded(res.invoice);
      toast.success('Invoice scanned successfully');
    } catch (e) {
      setPhase('idle');
      toast.error(e.response?.data?.error || 'Scan failed');
    }
  };

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = '';
  };

  const onDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  if (phase === 'processing') {
    return (
      <div style={{ border: '2px dashed var(--border)', borderRadius: 14, padding: 40, textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, border: '3px solid var(--blue-dim)', borderTopColor: 'var(--blue)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Processing Invoice…</p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{progress}</p>
      </div>
    );
  }

  if (phase === 'duplicate') {
    return (
      <div style={{ border: '1px solid rgba(217,119,6,0.4)', borderRadius: 14, padding: 24, background: 'rgba(217,119,6,0.06)' }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#FCD34D', marginBottom: 8 }}>⚠ Duplicate Invoice Detected</p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Invoice <strong>{duplicateInfo?.invoiceNumber}</strong> was already processed on {dayjs(duplicateInfo?.existingDate).format('D MMM YYYY')}.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => { setPhase('idle'); setDuplicateInfo(null); }}
            style={{ flex: 1, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 8, padding: '10px 0', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}
          >Cancel</button>
          <button
            onClick={async () => {
              setPhase('processing');
              setProgress('Re-processing invoice…');
              // Force re-scan by temporarily ignoring the duplicate
              toast('Re-applying is not supported from duplicate. View the existing invoice instead.');
              setPhase('idle');
            }}
            style={{ flex: 1, background: 'rgba(217,119,6,0.15)', border: '1px solid rgba(217,119,6,0.4)', color: '#FCD34D', borderRadius: 8, padding: '10px 0', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}
          >View Existing →</button>
        </div>
      </div>
    );
  }

  if (cameraOpen) {
    return (
      <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ position: 'relative', background: '#000', aspectRatio: '16/9' }}>
          <video ref={videoRef} style={{ width: '100%', objectFit: 'cover', display: 'block' }} playsInline muted />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
        <div style={{ display: 'flex', gap: 10, padding: 12 }}>
          <button onClick={stopCamera} style={{ flex: 1, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 8, padding: '10px 0', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Cancel</button>
          <button onClick={capturePhoto} style={{ flex: 2, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 0', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>📸 Capture Invoice</button>
        </div>
      </div>
    );
  }

  return (
    <div
      onDrop={onDrop}
      onDragOver={e => e.preventDefault()}
      style={{
        border: '2px dashed var(--border-hover)', borderRadius: 14,
        padding: '36px 24px', textAlign: 'center',
        background: 'var(--bg-input)', cursor: 'default',
        transition: 'border-color 0.2s',
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Drop invoice here or choose an option</p>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>JPG · PNG · PDF · Max 20MB</p>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={startCamera} style={{
          background: 'var(--blue-dim)', border: '1px solid var(--blue)', color: 'var(--blue-light)',
          borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>📷 Take Photo</button>
        <button onClick={() => fileRef.current?.click()} style={{
          background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)',
          borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>🖼 Upload Image</button>
        <button onClick={() => pdfRef.current?.click()} style={{
          background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)',
          borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>📄 Upload PDF</button>
      </div>

      <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp" style={{ display: 'none' }} onChange={onFileChange} />
      <input ref={pdfRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={onFileChange} />
    </div>
  );
}

// ── History tab ───────────────────────────────────────────────────────────────
function HistoryTab({ onViewInvoice }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    setLoading(true);
    api.get('/invoice-reader').then(r => setInvoices(r.invoices || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? invoices : invoices.filter(i => i.status === filter);

  const statusBadge = (s) => {
    const styles = {
      review:    { bg: 'rgba(217,119,6,0.15)',   color: '#FCD34D', label: 'Review' },
      applied:   { bg: 'rgba(22,163,74,0.15)',   color: '#4ADE80', label: 'Applied' },
      rejected:  { bg: 'rgba(220,38,38,0.15)',   color: '#F87171', label: 'Rejected' },
      processing:{ bg: 'rgba(37,99,235,0.15)',   color: '#60A5FA', label: 'Processing' },
    };
    const st = styles[s] || styles.review;
    return <span style={{ background: st.bg, color: st.color, padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>{st.label}</span>;
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div style={{ width: 32, height: 32, border: '3px solid var(--blue-dim)', borderTopColor: 'var(--blue)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} /></div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {['all', 'review', 'applied', 'rejected'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            background: filter === f ? 'var(--blue)' : 'var(--bg-elevated)',
            color: filter === f ? '#fff' : 'var(--text-muted)',
            border: `1px solid ${filter === f ? 'var(--blue)' : 'var(--border)'}`,
          }}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
        ))}
      </div>

      {filtered.length === 0
        ? <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px 0', fontSize: 13 }}>No invoices found</p>
        : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {filtered.map((inv, i) => (
              <div key={inv._id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                background: 'var(--bg-card)',
              }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {inv.supplierName || 'Unknown Supplier'}
                    {inv.invoiceNumber && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>#{inv.invoiceNumber}</span>}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {dayjs(inv.createdAt).format('DD MMM YYYY HH:mm')} ·
                    {inv.summary?.totalItems || 0} items ·
                    {inv.summary?.priceIncreases > 0 && <span style={{ color: '#F87171' }}> {inv.summary.priceIncreases} price ↑</span>}
                    {inv.summary?.priceDecreases > 0 && <span style={{ color: '#4ADE80' }}> {inv.summary.priceDecreases} price ↓</span>}
                  </p>
                </div>
                {statusBadge(inv.status)}
                {inv.status !== 'rejected' && (
                  <button onClick={() => onViewInvoice(inv._id)} style={{
                    background: 'var(--blue-dim)', border: '1px solid var(--blue)', color: 'var(--blue-light)',
                    borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}>View</button>
                )}
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function InvoiceReaderPage() {
  const [tab, setTab] = useState('scan');      // scan | history
  const [invoice, setInvoice] = useState(null);

  const handleUploaded = useCallback((inv) => {
    setInvoice(inv);
    setTab('review');
  }, []);

  const handleViewInvoice = useCallback(async (id) => {
    try {
      const res = await api.get(`/invoice-reader/${id}`);
      setInvoice(res.invoice);
      setTab('review');
    } catch { toast.error('Failed to load invoice'); }
  }, []);

  const handleUpdate = useCallback((inv) => {
    setInvoice(inv);
  }, []);

  return (
    <div style={{ padding: '20px 24px', height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          AI Invoice Reader
          <span style={{ marginLeft: 8, fontSize: 11, background: 'rgba(37,99,235,0.15)', color: 'var(--blue-light)', padding: '2px 8px', borderRadius: 10, fontWeight: 600, verticalAlign: 'middle' }}>NEW</span>
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Photograph or upload a supplier invoice — AI automatically detects price changes</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {[
          { key: 'scan', label: '📤 Scan Invoice' },
          { key: 'review', label: '🔍 Review', disabled: !invoice },
          { key: 'history', label: '📋 History' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => !t.disabled && setTab(t.key)}
            disabled={t.disabled}
            style={{
              padding: '8px 16px', border: 'none', background: 'none', cursor: t.disabled ? 'not-allowed' : 'pointer',
              color: tab === t.key ? 'var(--blue-light)' : t.disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
              fontWeight: tab === t.key ? 700 : 500, fontSize: 13,
              borderBottom: tab === t.key ? '2px solid var(--blue)' : '2px solid transparent',
              marginBottom: -1, transition: 'all 0.15s', opacity: t.disabled ? 0.4 : 1,
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'scan' && (
        <div style={{ maxWidth: 600 }}>
          <UploadZone onUploaded={handleUploaded} />
          {import.meta.env.DEV && (
            <div style={{ marginTop: 14, padding: '12px 16px', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: 8 }}>
              <p style={{ fontSize: 11, color: '#FCD34D' }}>⚠ Set <code>ANTHROPIC_API_KEY</code> in your backend .env file to enable AI scanning.</p>
            </div>
          )}
        </div>
      )}

      {tab === 'review' && invoice && (
        <div>
          {/* Invoice header */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>SUPPLIER</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{invoice.supplierName || 'Unknown'}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>INVOICE #</p>
              <p style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{invoice.invoiceNumber || '—'}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>DATE</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{invoice.invoiceDate ? dayjs(invoice.invoiceDate).format('DD MMM YYYY') : '—'}</p>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <button onClick={() => { setTab('scan'); setInvoice(null); }} style={{
                background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)',
                borderRadius: 7, padding: '6px 12px', fontSize: 11, cursor: 'pointer',
              }}>← Scan another</button>
            </div>
          </div>

          <ReviewTable invoice={invoice} onUpdate={handleUpdate} />
        </div>
      )}

      {tab === 'review' && !invoice && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
          <p>No invoice to review. Upload an invoice first.</p>
          <button onClick={() => setTab('scan')} style={{ marginTop: 12, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 12 }}>Go to Scan</button>
        </div>
      )}

      {tab === 'history' && <HistoryTab onViewInvoice={handleViewInvoice} />}
    </div>
  );
}
