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

// Mirrors the CORS logic in app.js — keep in sync
const _explicitOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',').map(o => o.trim()).filter(Boolean);
if (process.env.FRONTEND_URL) _explicitOrigins.push(process.env.FRONTEND_URL.trim());
const _originPatterns = [/^https?:\/\/.*\.vercel\.app$/, /^https?:\/\/.*\.railway\.app$/];
function isSocketOriginAllowed(origin) {
  if (!origin) return true;
  if (process.env.NODE_ENV !== 'production' && /^http:\/\/localhost(:\d+)?$/.test(origin)) return true;
  if (_explicitOrigins.includes(origin)) return true;
  return _originPatterns.some(re => re.test(origin));
}

// Create HTTP server and Socket.io immediately — do NOT wait for DB
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => callback(null, isSocketOriginAllowed(origin)),
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

// Start HTTP server — bind to 0.0.0.0 so Railway can route traffic to the container.
// Without an explicit host Node defaults to 127.0.0.1 which is unreachable externally.
server.listen(PORT, '0.0.0.0', () => {
  logger.info(`Vendora POS v3.0 running on 0.0.0.0:${PORT} [${process.env.NODE_ENV}]`);
  logger.info(`API: http://0.0.0.0:${PORT}/api`);
  logger.info(`Health: http://0.0.0.0:${PORT}/health`);

  // Start cron jobs after server is up
  if (process.env.NODE_ENV !== 'test') {
    const initJobs = require('./src/jobs');
    initJobs(io);
  }
});

// Connect to MongoDB and Redis in the background — never block or crash on failure
connectDB().catch((err) => {
  // connectDB already retries internally — this catch is a safety net only
  logger.error(`Initial DB connect error (will keep retrying): ${err.message}`);
});

connectRedis();

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
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  logger.error('Unhandled Rejection', { error: msg, stack });
});
process.on('uncaughtException', (err) => {
  const msg = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error('Uncaught Exception', { error: msg, stack });
  // DO NOT call process.exit() — keep server running
});
