import api from './api';
export const getStores = () => api.get('/auth/stores');
export const login = (data) => api.post('/auth/login', data);
export const logout = (refreshToken) => api.post('/auth/logout', { refreshToken });
export const refresh = (refreshToken) => api.post('/auth/refresh', { refreshToken });
export const verifyPin = (pin, action) => api.post('/auth/verify-pin', { pin, action });
export const getMe = () => api.get('/auth/me');
