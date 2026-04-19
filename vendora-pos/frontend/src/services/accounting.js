import api from './api';

// Dashboard
export const getDashboard = () => api.get('/accounting/dashboard');

// VAT
export const listVatReturns = () => api.get('/accounting/vat');
export const previewVatReturn = (periodStart, periodEnd) =>
  api.post('/accounting/vat/preview', { periodStart, periodEnd });
export const createVatReturn = (periodStart, periodEnd) =>
  api.post('/accounting/vat', { periodStart, periodEnd });
export const getVatReturn  = (id) => api.get(`/accounting/vat/${id}`);
export const updateVatReturn = (id, data) => api.patch(`/accounting/vat/${id}`, data);

// Payroll
export const listPayrollRuns = () => api.get('/accounting/payroll');
export const calculatePayroll = (periodStart, periodEnd, frequency) =>
  api.post('/accounting/payroll/calculate', { periodStart, periodEnd, frequency });
export const createPayrollRun = (periodStart, periodEnd, frequency) =>
  api.post('/accounting/payroll', { periodStart, periodEnd, frequency });
export const getPayrollRun = (id) => api.get(`/accounting/payroll/${id}`);
export const updatePayrollRun = (id, data) => api.patch(`/accounting/payroll/${id}`, data);
export const updatePayrollEmployee = (runId, staffId, data) =>
  api.put(`/accounting/payroll/${runId}/employee/${staffId}`, data);
export const deletePayrollEmployee = (runId, staffId) =>
  api.delete(`/accounting/payroll/${runId}/employee/${staffId}`);
export const downloadPayslip = (runId, staffId) =>
  `/api/accounting/payroll/${runId}/payslip/${staffId}`;

// Expenses
export const listExpenses = (params = {}) => {
  const q = new URLSearchParams(params).toString();
  return api.get(`/accounting/expenses${q ? `?${q}` : ''}`);
};
export const createExpense = (data) => api.post('/accounting/expenses', data);
export const updateExpense = (id, data) => api.patch(`/accounting/expenses/${id}`, data);
export const deleteExpense = (id) => api.delete(`/accounting/expenses/${id}`);

// P&L
export const getProfitLoss = (from, to) => {
  const q = new URLSearchParams({ ...(from && { from }), ...(to && { to }) }).toString();
  return api.get(`/accounting/pl${q ? `?${q}` : ''}`);
};

// Settings
export const getAccountingSettings = () => api.get('/accounting/settings');
export const saveAccountingSettings = (data) => api.put('/accounting/settings', data);
