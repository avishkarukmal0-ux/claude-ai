import api from './api';
export const getGiftCards = () => api.get('/gift-cards');
export const checkBalance = (code) => api.get(`/gift-cards/check/${code}`);
export const issueGiftCard = (data) => api.post('/gift-cards', data);
export const redeemGiftCard = (code, amount) => api.post(`/gift-cards/${code}/redeem`, { amount });
export const topupGiftCard = (code, amount) => api.post(`/gift-cards/${code}/topup`, { amount });
export const getStats = () => api.get('/gift-cards/stats');
