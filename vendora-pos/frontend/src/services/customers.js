import api from './api';
export const getCustomers = (params) => api.get('/customers', { params });
export const getCustomer = (id) => api.get(`/customers/${id}`);
export const lookupCustomer = (q) => api.get(`/customers/lookup/${q}`);
export const createCustomer = (data) => api.post('/customers', data);
export const updateCustomer = (id, data) => api.put(`/customers/${id}`, data);
export const getCustomerHistory = (id, params) => api.get(`/customers/${id}/history`, { params });
export const getCustomerPoints = (id) => api.get(`/customers/${id}/points`);
export const redeemPoints = (id, pointsToRedeem) => api.post(`/customers/${id}/points/redeem`, { pointsToRedeem });
