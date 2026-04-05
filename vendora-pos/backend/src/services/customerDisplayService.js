'use strict';
let _io = null;
const setIo = (io) => { _io = io; };
const update = (tillId, storeId, data) => { if (_io) _io.to(`store:${storeId}`).emit('display:update', { tillId, ...data }); };
const clear = (tillId, storeId) => { if (_io) _io.to(`store:${storeId}`).emit('display:update', { tillId, status: 'idle', items: [], total: 0 }); };
module.exports = { setIo, update, clear };
