import api from './api';
export const getStaff = () => api.get('/staff');
export const getStaffMember = (id) => api.get(`/staff/${id}`);
export const createStaff = (data) => api.post('/staff', data);
export const updateStaff = (id, data) => api.put(`/staff/${id}`, data);
export const clockIn = (id, tillId) => api.post(`/staff/${id}/clock-in`, { tillId });
export const clockOut = (id) => api.post(`/staff/${id}/clock-out`);
export const getTimecard = (id) => api.get(`/staff/${id}/timecard`);
