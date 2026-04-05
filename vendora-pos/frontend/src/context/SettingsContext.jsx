import React, { createContext, useContext, useState } from 'react';
const SettingsContext = createContext(null);
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({ tillId: localStorage.getItem('tillId') || 'TILL-1', theme: 'dark' });
  const updateSettings = (updates) => { setSettings(prev => ({ ...prev, ...updates })); if (updates.tillId) localStorage.setItem('tillId', updates.tillId); };
  return <SettingsContext.Provider value={{ settings, updateSettings }}>{children}</SettingsContext.Provider>;
}
export const useSettings = () => useContext(SettingsContext);
