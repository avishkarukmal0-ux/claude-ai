const config = require('./index');
const logger = require('../utils/logger');

let redisClient = null;
let redisAvailable = false;
let connectionAttempted = false;

// No-op stub returned when Redis is unavailable — callers need not change.
const nullRedis = {
  get: async () => null,
  set: async () => 'OK',
  setex: async () => 'OK',
  del: async () => 0,
  exists: async () => 0,
  expire: async () => 0,
  ttl: async () => -2,
  hget: async () => null,
  hset: async () => 0,
  hdel: async () => 0,
  sadd: async () => 0,
  srem: async () => 0,
  smembers: async () => [],
  lpush: async () => 0,
  lrange: async () => [],
  publish: async () => 0,
  subscribe: async () => {},
  on: () => nullRedis,
  quit: async () => {},
};

const connectRedis = () => {
  if (connectionAttempted) return redisClient;
  connectionAttempted = true;

  // Skip if explicitly disabled
  if (!process.env.REDIS_URL && process.env.NODE_ENV !== 'production') {
    logger.warn('Redis: REDIS_URL not set — running without Redis (caching and token blacklisting disabled)');
    return null;
  }

  let Redis;
  try {
    Redis = require('ioredis');
  } catch {
    logger.warn('Redis: ioredis not installed — running without Redis');
    return null;
  }

  redisClient = new Redis(config.redis.url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy() {
      return null; // disable auto-reconnect; we handle it manually
    },
  });

  redisClient.on('connect', () => {
    redisAvailable = true;
    logger.info('Redis connected');
  });

  redisClient.on('error', () => {
    // errors are suppressed after the first connection attempt warning
  });

  redisClient.connect().catch((err) => {
    logger.warn(`Redis unavailable (${err.message}) — running without Redis. Set REDIS_URL to enable caching.`);
    redisClient = null;
  });

  return redisClient;
};

const getRedis = () => {
  if (!connectionAttempted) connectRedis();
  return redisAvailable ? redisClient : nullRedis;
};

const isRedisAvailable = () => redisAvailable;

module.exports = { connectRedis, getRedis, isRedisAvailable };
