const Redis = require('ioredis');
const config = require('./index');
const logger = require('../utils/logger');

let redisClient = null;

const connectRedis = () => {
  if (redisClient) return redisClient;

  redisClient = new Redis(config.redis.url, {
    retryStrategy(times) {
      if (times > 10) {
        logger.warn('Redis: too many retries, giving up');
        return null;
      }
      return Math.min(times * 100, 3000);
    },
    lazyConnect: false,
  });

  redisClient.on('connect', () => {
    logger.info('Redis connected');
  });

  redisClient.on('error', (err) => {
    logger.error('Redis error:', err.message);
  });

  redisClient.on('close', () => {
    logger.warn('Redis connection closed');
  });

  return redisClient;
};

const getRedis = () => {
  if (!redisClient) return connectRedis();
  return redisClient;
};

module.exports = { connectRedis, getRedis };
