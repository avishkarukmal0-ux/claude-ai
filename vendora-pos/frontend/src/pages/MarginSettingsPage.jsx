import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, RotateCcw, Save, Calculator, TrendingUp, AlertTriangle, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import * as marginSvc from '../services/margins';

const fmt = (n) => `£${Number(n || 0).toFixed(2)}`;
const r2  = (n) => Math.round((n || 0) * 100) / 100;

// Preview: what does £1.00 cost become at target margin?
function previewPrice(targetMargin, vatRate) {
  if (targetMargin >= 100) return '£1.00';
  const excVat = 1 / (1 - targetMargin / 100);
  const incVat = excVat * (1 + (vatRate || 20) / 100);
  return fmt(Math.ceil(incVat * 20) / 20);
}

// ── Quick Calculator ─────────────────────────────────────────────────────────
function MarginCalculator({ categories, defaultMargin }) {
  const [cost, setCost] = useState('');
  const [catName, setCatName] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const calculate = async () => {
    const c = parseFloat(cost);
    if (!c || c <= 0) { toast.error('Enter a cost price'); return; }
    setLoading(true);
    try {
      const res = await marginSvc.calculateMargin({ costPrice: c, category: catName });
      setResult(res);
    } catch {
      toast.error('Calculation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border p-5">
      <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <Calculator size={16} className="text-blue-600" /> Quick Margin Calculator
      </h3>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Cost Price (exc VAT)</label>
          <input
            type="number" step="0.01" min="0" placeholder="0.00"
            className="border rounded-lg px-3 py-2 text-sm w-32"
            value={cost} onChange={e => { setCost(e.target.value); setResult(null); }}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Category</label>
          <select
            className="border rounded-lg px-3 py-2 text-sm"
            value={catName} onChange={e => { setCatName(e.target.value); setResult(null); }}
          >
            <option value="">Default ({defaultMargin}%)</option>
            {(categories || []).map(c => (
              <option key={c.name} value={c.name}>{c.name} ({c.targetMargin}%)</option>
            ))}
          </select>
        </div>
        <button
          onClick={calculate} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Calculator size={14} />}
          Calculate
        </button>
      </div>

      {result && (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">Suggested (exc VAT)</p>
            <p className="text-lg font-bold text-blue-700">{fmt(result.suggestedRetailExcVat)}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">Suggested (inc VAT)</p>
            <p className="text-lg font-bold text-green-700">{fmt(result.suggestedRetailIncVat)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">Your Margin</p>
            <p className="text-lg font-bold text-gray-900">{result.actualMargin}%</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">VAT to Collect</p>
            <p className="text-lg font-bold text-gray-900">{fmt(result.vatAmount)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Per-Product Margins ───────────────────────────────────────────────────────
// Search products and pin an individual product's target margin, independent of
// its category. Blank = inherit category/default.
const STATUS_DOT = { green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500' };

function ProductMarginList() {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [edits, setEdits] = useState({}); // id -> string value being typed
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async (term) => {
    setLoading(true);
    try {
      const res = await marginSvc.getProductMargins(term ? { search: term, limit: 50 } : { limit: 50 });
      setRows(res.products || []);
      setEdits({});
    } catch {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(''); }, [load]);

  const save = async (row, reprice) => {
    const raw = edits[row.id] !== undefined ? edits[row.id] : (row.override ?? '');
    setSavingId(row.id);
    try {
      await marginSvc.setProductMargin(row.id, {
        targetMargin: raw === '' ? null : Number(raw),
        applySuggestedPrice: !!reprice,
      });
      toast.success(reprice ? 'Margin set & repriced' : 'Margin set');
      load(search);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not save');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border mb-5 overflow-hidden">
      <div className="p-4 border-b">
        <h3 className="font-semibold text-gray-800">Per-Product Margins</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Pin a specific product’s margin, independent of its category. Leave blank to follow the category/default.
        </p>
        <form onSubmit={(e) => { e.preventDefault(); load(search); }} className="mt-3 flex gap-2">
          <input
            className="border rounded-lg px-3 py-2 text-sm flex-1 max-w-xs focus:ring-1 focus:ring-blue-400 focus:outline-none"
            placeholder="Search by name, barcode or category…"
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            Search
          </button>
        </form>
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><RefreshCw className="animate-spin text-blue-600" size={22} /></div>
      ) : rows.length === 0 ? (
        <p className="p-6 text-sm text-gray-400 text-center">No products found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Product</th>
                <th className="px-4 py-3 text-right">Cost</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-center">Now</th>
                <th className="px-4 py-3 text-center">Target</th>
                <th className="px-4 py-3 text-center">This product %</th>
                <th className="px-4 py-3 text-center">Suggested</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => {
                const val = edits[row.id] !== undefined ? edits[row.id] : (row.override ?? '');
                return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-800">{row.name}</div>
                      <div className="text-xs text-gray-400">{row.category || '—'}</div>
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">{fmt(row.cost)}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{fmt(row.retail)}</td>
                    <td className="px-4 py-2 text-center">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${STATUS_DOT[row.status] || 'bg-gray-300'}`} />
                        {row.actualMargin}%
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className="text-gray-700">{row.effectiveTarget}%</span>
                      <div className="text-[10px] text-gray-400">{row.source}</div>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <input
                        type="number" min="0" max="100" step="1" placeholder="—"
                        className="border rounded px-2 py-1 text-sm w-16 text-center focus:ring-1 focus:ring-blue-400 focus:outline-none"
                        value={val}
                        onChange={(e) => setEdits((m) => ({ ...m, [row.id]: e.target.value }))}
                      />
                    </td>
                    <td className="px-4 py-2 text-center text-gray-500">{fmt(row.suggestedRetail)}</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => save(row, false)} disabled={savingId === row.id}
                          className="px-2.5 py-1 border rounded text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                          title="Save this product's target margin"
                        >
                          Set
                        </button>
                        <button
                          onClick={() => save(row, true)} disabled={savingId === row.id}
                          className="px-2.5 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                          title="Save and update the price to the suggested retail"
                        >
                          Set &amp; reprice
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function MarginSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await marginSvc.getMarginSettings();
      setSettings(res.settings);
    } catch {
      toast.error('Failed to load margin settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = (key, value) => {
    setSettings(s => ({ ...s, [key]: value }));
    setDirty(true);
  };

  const updateCategory = (i, field, value) => {
    setSettings(s => {
      const cats = [...s.categories];
      cats[i] = { ...cats[i], [field]: field === 'name' ? value : Number(value) || 0 };
      return { ...s, categories: cats };
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await marginSvc.saveMarginSettings({
        defaultMargin:      settings.defaultMargin,
        categories:         settings.categories,
        alertBelowMinMargin: settings.alertBelowMinMargin,
        autoSuggestPrice:   settings.autoSuggestPrice,
        showMarginOnPOS:    settings.showMarginOnPOS,
      });
      setSettings(res.settings);
      setDirty(false);
      toast.success('Margin settings saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Reset all margins to UK c-store defaults? Your changes will be lost.')) return;
    setSaving(true);
    try {
      const res = await marginSvc.resetDefaults();
      setSettings(res.settings);
      setDirty(false);
      toast.success('Reset to UK defaults');
    } catch {
      toast.error('Failed to reset');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex justify-center p-12">
      <RefreshCw className="animate-spin text-blue-600" size={28} />
    </div>
  );
  if (!settings) return null;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profit Margin Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Set your target margins per category. Vendora uses these to suggest retail prices
            when you receive new invoices.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/invoice-reader" className="flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1">
            Invoice Reader <ChevronRight size={12} />
          </Link>
        </div>
      </div>

      {/* Default Margin Slider */}
      <div className="bg-white rounded-xl border p-5 mb-5">
        <h3 className="font-semibold text-gray-800 mb-1">Default Margin</h3>
        <p className="text-xs text-gray-500 mb-4">Used for products not matching any category below</p>
        <div className="flex items-center gap-4">
          <input
            type="range" min="0" max="80" step="1"
            className="flex-1 accent-blue-600"
            value={settings.defaultMargin}
            onChange={e => update('defaultMargin', Number(e.target.value))}
          />
          <span className="text-2xl font-bold text-blue-700 w-14 text-right">{settings.defaultMargin}%</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Cost £1.00 → {previewPrice(settings.defaultMargin, 20)} (inc 20% VAT)
        </p>
      </div>

      {/* Category Margins Table */}
      <div className="bg-white rounded-xl border mb-5 overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Category Margins</h3>
          <p className="text-xs text-gray-400">Preview shows what £1.00 cost becomes at your target margin</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-center">Target %</th>
                <th className="px-4 py-3 text-center">Min %</th>
                <th className="px-4 py-3 text-center">Max %</th>
                <th className="px-4 py-3 text-center">VAT</th>
                <th className="px-4 py-3 text-center">Preview (cost £1.00)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {settings.categories.map((cat, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <input
                      className="border rounded px-2 py-1 text-sm w-44 focus:ring-1 focus:ring-blue-400 focus:outline-none"
                      value={cat.name}
                      onChange={e => updateCategory(i, 'name', e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="number" min="0" max="100" step="1"
                      className={`border rounded px-2 py-1 text-sm w-16 text-center focus:ring-1 focus:outline-none ${
                        cat.targetMargin < cat.minMargin ? 'border-red-400 focus:ring-red-400' : 'focus:ring-blue-400'
                      }`}
                      value={cat.targetMargin}
                      onChange={e => updateCategory(i, 'targetMargin', e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="number" min="0" max="100" step="1"
                      className="border rounded px-2 py-1 text-sm w-16 text-center focus:ring-1 focus:ring-blue-400 focus:outline-none"
                      value={cat.minMargin}
                      onChange={e => updateCategory(i, 'minMargin', e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="number" min="0" max="100" step="1"
                      className="border rounded px-2 py-1 text-sm w-16 text-center focus:ring-1 focus:ring-blue-400 focus:outline-none"
                      value={cat.maxMargin}
                      onChange={e => updateCategory(i, 'maxMargin', e.target.value)}
                      placeholder="0"
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <select
                      className="border rounded px-2 py-1 text-sm focus:ring-1 focus:ring-blue-400 focus:outline-none"
                      value={cat.vatRate}
                      onChange={e => updateCategory(i, 'vatRate', e.target.value)}
                    >
                      <option value={0}>0%</option>
                      <option value={5}>5%</option>
                      <option value={20}>20%</option>
                    </select>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`font-mono text-sm font-semibold ${
                      cat.targetMargin < cat.minMargin ? 'text-red-600' :
                      cat.targetMargin < 20 ? 'text-amber-600' : 'text-green-700'
                    }`}>
                      {previewPrice(cat.targetMargin, cat.vatRate)}
                    </span>
                    {cat.targetMargin < cat.minMargin && (
                      <p className="text-xs text-red-500 mt-0.5">Target below min!</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-Product Margins */}
      <ProductMarginList />

      {/* Global Toggles */}
      <div className="bg-white rounded-xl border p-5 mb-5">
        <h3 className="font-semibold text-gray-800 mb-4">Alerts &amp; Automation</h3>
        <div className="space-y-3">
          {[
            { key: 'alertBelowMinMargin', label: 'Alert me when invoice prices drop products below minimum margin', desc: 'Shows a red banner in Invoice Reader' },
            { key: 'autoSuggestPrice',    label: 'Automatically suggest retail prices when processing invoices', desc: 'Adds "Suggested Retail" column to Invoice Reader review table' },
            { key: 'showMarginOnPOS',     label: 'Show profit margin badge on POS product cards', desc: 'Visible to cashiers — shows green/amber/red margin indicator' },
          ].map(({ key, label, desc }) => (
            <label key={key} className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 accent-blue-600"
                checked={!!settings[key]}
                onChange={e => update(key, e.target.checked)}
              />
              <div>
                <p className="text-sm font-medium text-gray-700">{label}</p>
                <p className="text-xs text-gray-400">{desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Calculator */}
      <MarginCalculator categories={settings.categories} defaultMargin={settings.defaultMargin} />

      {/* Actions */}
      <div className="flex items-center justify-between mt-6">
        <button
          onClick={handleReset} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <RotateCcw size={14} /> Reset to UK Defaults
        </button>
        <button
          onClick={handleSave} disabled={saving || !dirty}
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          Save Settings
        </button>
      </div>
      {dirty && <p className="text-xs text-amber-600 text-right mt-2">You have unsaved changes</p>}
    </div>
  );
}
