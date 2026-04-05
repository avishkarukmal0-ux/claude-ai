import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as authService from '../services/auth';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [storeId, setStoreId] = useState(localStorage.getItem('storeId') || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      authService.getMe()
        .then((data) => setUser(data.staff))
        .catch(() => { localStorage.removeItem('accessToken'); localStorage.removeItem('refreshToken'); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (credentials) => {
    const data = await authService.login(credentials);
    if (data.require2fa) return data;
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    if (credentials.storeId) {
      localStorage.setItem('storeId', credentials.storeId);
      setStoreId(credentials.storeId);
    }
    setUser(data.staff);
    return data;
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try { await authService.logout(refreshToken); } catch { }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
  }, []);

  const verifyPin = useCallback(async (pin, action) => {
    return authService.verifyPin(pin, action);
  }, []);

  const hasRole = useCallback((requiredRole) => {
    const hierarchy = { cashier: 1, supervisor: 2, manager: 3, owner: 4 };
    const userLevel = hierarchy[user?.role] || 0;
    const required = hierarchy[requiredRole] || 99;
    return userLevel >= required;
  }, [user]);

  const hasPermission = useCallback((permission) => {
    if (!user) return false;
    if (user.role === 'owner' || user.role === 'manager') return true;
    return !!user.permissions?.[permission];
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, storeId, loading, login, logout, verifyPin, hasRole, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
