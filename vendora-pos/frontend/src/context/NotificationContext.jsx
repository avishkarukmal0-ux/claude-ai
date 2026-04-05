import React, { createContext, useContext, useState, useCallback } from 'react';
const NotificationContext = createContext(null);
export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const addNotification = useCallback((n) => { const id = Date.now(); setNotifications(prev => [{ ...n, id }, ...prev].slice(0, 20)); return id; }, []);
  const removeNotification = useCallback((id) => setNotifications(prev => prev.filter(n => n.id !== id)), []);
  return <NotificationContext.Provider value={{ notifications, addNotification, removeNotification }}>{children}</NotificationContext.Provider>;
}
export const useNotifications = () => useContext(NotificationContext);
