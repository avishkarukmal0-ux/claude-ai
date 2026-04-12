import api from './api';

export const getMarginSettings = () => api.get('/margins');
export const saveMarginSettings = (data) => api.put('/margins', data);
export const calculateMargin = (params) => {
  const q = new URLSearchParams(params).toString();
  return api.get(`/margins/calculate?${q}`);
};
export const bulkCalculate = (items) => api.post('/margins/bulk-calculate', { items });
export const resetDefaults = () => api.post('/margins/reset-defaults');
