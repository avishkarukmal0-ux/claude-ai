import React, { createContext, useContext, useState, useEffect } from 'react';
const OfflineContext = createContext(null);
export function OfflineProvider({ children }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return <OfflineContext.Provider value={{ isOnline }}>{children}</OfflineContext.Provider>;
}
export const useOffline = () => useContext(OfflineContext);
