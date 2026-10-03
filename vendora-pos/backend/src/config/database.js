const mongoose = require('mongoose');
const config = require('./index');
const logger = require('../utils/logger');

let keepaliveInterval = null;
let isConnecting = false;

const connectDB = async () => {
  if (isConnecting) return;
  isConnecting = true;
  try {
    await mongoose.connect(config.mongodb.uri, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000,
      heartbeatFrequencyMS: 10000,
      retryWrites: true,
      maxPoolSize: 10,
    });
    isConnecting = false;
    logger.info(`MongoDB connected: ${mongoose.connection.host}`);
    startKeepalive();
  } catch (err) {
    isConnecting = false;
    logger.error(`MongoDB connection failed: ${err.message} — retrying in 5s`);
    setTimeout(() => connectDB(), 5000);
  }
};

function startKeepalive() {
  if (keepaliveInterval) clearInterval(keepaliveInterval);
  keepaliveInterval = setInterval(async () => {
    if (mongoose.connection.readyState !== 1) return;
    try {
      await mongoose.connection.db.admin().ping();
    } catch (err) {
      logger.warn(`MongoDB keepalive ping failed: ${err.message}`);
    }
  }, 30000);
}

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected — retrying in 5s');
  if (keepaliveInterval) { clearInterval(keepaliveInterval); keepaliveInterval = null; }
  setTimeout(() => connectDB(), 5000);
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected');
  startKeepalive();
});

mongoose.connection.on('error', (err) => {
  logger.error(`MongoDB error: ${err.message}`);
});

module.exports = connectDB;
