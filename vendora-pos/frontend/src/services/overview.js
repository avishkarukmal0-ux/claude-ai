import api from './api';

// Owner "This Week" overview — theft, waste, sales & margin at a glance.
export const getThisWeek = () => api.get('/overview/this-week');

// End-of-day "shop closed fine" recap the owner can share to their phone.
export const getDailySummary = () => api.get('/overview/daily-summary');

// Nightly auto-delivery settings (WhatsApp) — manager only.
export const getSummarySettings = () => api.get('/overview/summary-settings');
export const saveSummarySettings = (data) => api.put('/overview/summary-settings', data);
export const testSummary = () => api.post('/overview/summary-settings/test');
