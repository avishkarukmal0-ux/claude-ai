import api from './api';
export const getInvoices = () => api.get('/invoices');
export const getInvoice = (id) => api.get(`/invoices/${id}`);
export const createInvoice = (data) => api.post('/invoices', data);
export const verifyInvoice = (id) => api.post(`/invoices/${id}/verify`);
export const payInvoice = (id) => api.post(`/invoices/${id}/pay`);
