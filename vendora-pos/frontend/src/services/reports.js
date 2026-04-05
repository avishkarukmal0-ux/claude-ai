import api from './api';
export const getXReport = (tillId) => api.get(`/reports/x-report/${tillId}`);
export const getZReport = (tillId) => api.get(`/reports/z-report/${tillId}`);
export const getSummary = (params) => api.get('/reports/summary', { params });
export const getCategoryBreakdown = (params) => api.get('/reports/category', { params });
export const getStaffPerformance = (params) => api.get('/reports/staff', { params });
export const getHourlyBreakdown = (params) => api.get('/reports/hourly', { params });
export const getProductPerformance = (params) => api.get('/reports/products', { params });
