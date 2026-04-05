import api from './api';
export const createSale = (data) => api.post('/sales', data);
export const getSales = (params) => api.get('/sales', { params });
export const getSale = (id) => api.get(`/sales/${id}`);
export const getByReceipt = (number) => api.get(`/sales/receipt/${number}`);
export const voidSale = (id, data) => api.post(`/sales/${id}/void`, data);
export const refundSale = (id, data) => api.post(`/sales/${id}/refund`, data);
export const getTodaySummary = () => api.get('/sales/today/summary');
