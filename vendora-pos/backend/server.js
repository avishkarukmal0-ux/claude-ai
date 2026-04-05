'use strict';

require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');
const app = require('./src/app');
const connectDB = require('./src/config/database');
const { connectRedis } = require('./src/config/redis');
const logger = require('./src/utils/logger');
const lossPreventionService = require('./src/services/lossPreventionService');
const customerDisplayService = require('./src/services/customerDisplayService');

const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

async function start() {
  // Connect to databases
  await connectDB();
  connectRedis();

  // Create HTTP server
  const server = http.createServer(app);

  // Socket.io
  const io = new Server(server, {
    cors: {
      origin: CORS_ORIGIN,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Attach io instance to app and services
  app.set('io', io);
  lossPreventionService.setIo(io);
  customerDisplayService.setIo(io);

  // Socket.io connection handling
  io.on('connection', (socket) => {
    logger.debug(`Socket connected: ${socket.id}`);

    socket.on('subscribe:store', ({ storeId }) => {
      if (storeId) {
        socket.join(`store:${storeId}`);
        logger.debug(`Socket ${socket.id} joined store:${storeId}`);
      }
    });

    socket.on('subscribe:till', ({ tillId, storeId }) => {
      if (tillId) socket.join(`till:${tillId}`);
      if (storeId) socket.join(`store:${storeId}`);
    });

    socket.on('display:cart', ({ tillId, storeId, items, subtotal, total }) => {
      io.to(`store:${storeId}`).emit('display:update', { tillId, items, subtotal, total, status: 'cart' });
    });

    socket.on('display:payment', ({ tillId, storeId, status }) => {
      io.to(`store:${storeId}`).emit('display:update', { tillId, status: 'payment' });
    });

    socket.on('display:idle', ({ tillId, storeId }) => {
      io.to(`store:${storeId}`).emit('display:update', { tillId, status: 'idle', items: [], total: 0 });
    });

    socket.on('lone_worker:checkin', ({ sessionId }) => {
      logger.debug(`Lone worker check-in: session ${sessionId}`);
    });

    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${socket.id}`);
    });
  });

  // Start cron jobs
  if (process.env.NODE_ENV !== 'test') {
    const initJobs = require('./src/jobs');
    initJobs(io);
  }

  server.listen(PORT, () => {
    logger.info(`Vendora POS v3.0 running on port ${PORT} [${process.env.NODE_ENV}]`);
    logger.info(`API: http://localhost:${PORT}/api`);
    logger.info(`Health: http://localhost:${PORT}/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => {
    logger.error('Unhandled rejection:', err);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
