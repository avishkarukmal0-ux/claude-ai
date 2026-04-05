import api from './api';
export const getPromotions = () => api.get('/promotions');
export const getActivePromotions = () => api.get('/promotions/active');
export const createPromotion = (data) => api.post('/promotions', data);
export const updatePromotion = (id, data) => api.put(`/promotions/${id}`, data);
export const activatePromotion = (id) => api.post(`/promotions/${id}/activate`);
export const pausePromotion = (id) => api.post(`/promotions/${id}/pause`);
export const applyPromotions = (items, promoCode) => api.post('/promotions/apply', { items, promoCode });
