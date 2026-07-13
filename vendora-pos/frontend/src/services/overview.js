import api from './api';

// Owner "This Week" overview — theft, waste, sales & margin at a glance.
export const getThisWeek = () => api.get('/overview/this-week');
