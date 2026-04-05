import React, { useState, useEffect } from 'react';
import { Save, Store, Bell, Shield, Printer, RefreshCw } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('store');

  useEffect(() => {
    api.get('/settings').then(r => {
      setSettings(r.settings || r);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await api.put('/settings', settings);
      toast.success('Settings saved');
    } catch {
    } finally { setSaving(false); }
  }

  const set = (path, value) => {
    setSettings(s => {
      const copy = { ...s };
      const parts = path.split('.');
      let obj = copy;
      for (let i = 0; i < parts.length - 1; i++) {
        obj[parts[i]] = { ...obj[parts[i]] };
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = value;
      return copy;
    });
  };

  const tabs = [
    { id: 'store', label: 'Store', icon: Store },
    { id: 'pos', label: 'POS', icon: Printer },
    { id: 'loyalty', label: 'Loyalty', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
  ];

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Store configuration and preferences</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          <Save size={16} /> {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {!settings ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-400">Settings not available</div>
      ) : (
        <div className="bg-white rounded-xl border p-6 max-w-2xl space-y-5">
          {tab === 'store' && (
            <>
              <Field label="Store Name" value={settings.name || ''} onChange={v => set('name', v)} />
              <Field label="VAT Number" value={settings.vatNumber || ''} onChange={v => set('vatNumber', v)} />
              <Field label="Address Line 1" value={settings.address?.line1 || ''} onChange={v => set('address.line1', v)} />
              <Field label="Address Line 2" value={settings.address?.line2 || ''} onChange={v => set('address.line2', v)} />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Town/City" value={settings.address?.city || ''} onChange={v => set('address.city', v)} />
                <Field label="Postcode" value={settings.address?.postcode || ''} onChange={v => set('address.postcode', v)} />
              </div>
              <Field label="Phone" value={settings.phone || ''} onChange={v => set('phone', v)} />
              <Field label="Email" value={settings.email || ''} onChange={v => set('email', v)} />
            </>
          )}
          {tab === 'pos' && (
            <>
              <NumField label="Target Float (£)" value={settings.settings?.targetFloat ?? 150} onChange={v => set('settings.targetFloat', v)} />
              <NumField label="Safe Drop Threshold (£)" value={settings.settings?.safeDropThreshold ?? 200} onChange={v => set('settings.safeDropThreshold', v)} />
              <Toggle label="Print Receipts by Default" value={!!settings.settings?.printReceiptByDefault} onChange={v => set('settings.printReceiptByDefault', v)} />
              <Toggle label="Show Customer Pole Display" value={!!settings.settings?.poleDisplay} onChange={v => set('settings.poleDisplay', v)} />
            </>
          )}
          {tab === 'loyalty' && (
            <>
              <Toggle label="Loyalty Programme Enabled" value={!!settings.settings?.loyalty?.enabled} onChange={v => set('settings.loyalty.enabled', v)} />
              <NumField label="Points per £1 Spent" value={settings.settings?.loyalty?.pointsPerPound ?? 1} onChange={v => set('settings.loyalty.pointsPerPound', v)} />
              <NumField label="Point Redemption Value (pence)" value={settings.settings?.loyalty?.pointValue ?? 1} onChange={v => set('settings.loyalty.pointValue', v)} />
            </>
          )}
          {tab === 'security' && (
            <>
              <Toggle label="Challenge 25 Enabled" value={!!settings.settings?.challenge25} onChange={v => set('settings.challenge25', v)} />
              <Toggle label="Require Supervisor PIN for Voids" value={!!settings.settings?.requirePinForVoid} onChange={v => set('settings.requirePinForVoid', v)} />
              <Toggle label="Require Supervisor PIN for Discounts" value={!!settings.settings?.requirePinForDiscount} onChange={v => set('settings.requirePinForDiscount', v)} />
              <NumField label="Max Cashier Discount (%)" value={settings.settings?.maxCashierDiscount ?? 5} onChange={v => set('settings.maxCashierDiscount', v)} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function NumField({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type="number" step="0.01" min="0" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={value} onChange={e => onChange(Number(e.target.value))} />
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <label className="flex items-center justify-between cursor-pointer py-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? 'bg-primary' : 'bg-gray-300'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </label>
  );
}
