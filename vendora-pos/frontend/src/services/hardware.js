import api from './api';
export const getPrinterStatus = () => api.get('/hardware/printer/status');
export const testPrint = () => api.post('/hardware/printer/test');
export const openDrawer = () => api.post('/hardware/drawer/open');
export const getWeight = () => api.get('/hardware/scale/weight');
export const getTerminalStatus = () => api.get('/hardware/terminal/status');
