import api from './api';
export const getPurchaseOrders = (params) => api.get('/purchase-orders', { params });
export const getPurchaseOrder = (id) => api.get(`/purchase-orders/${id}`);
export const createPurchaseOrder = (data) => api.post('/purchase-orders', data);
export const updatePurchaseOrder = (id, data) => api.put(`/purchase-orders/${id}`, data);
export const sendOrder = (id) => api.post(`/purchase-orders/${id}/send`);
export const receiveOrder = (id) => api.post(`/purchase-orders/${id}/receive`);
