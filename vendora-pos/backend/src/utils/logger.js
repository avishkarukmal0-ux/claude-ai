const { createLogger, format, transports } = require('winston');
const path = require('path');

const { combine, timestamp, errors, json, colorize, printf } = format;

const devFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return `${ts} [${level}]: ${stack || message}`;
});

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    process.env.NODE_ENV === 'production' ? json() : combine(colorize(), devFormat)
  ),
  transports: [
    new transports.Console(),
  ],
});

if (process.env.NODE_ENV === 'production') {
  logger.add(
    new transports.File({
      filename: path.join(process.env.UPLOAD_PATH || './uploads', '../logs/error.log'),
      level: 'error',
    })
  );
  logger.add(
    new transports.File({
      filename: path.join(process.env.UPLOAD_PATH || './uploads', '../logs/combined.log'),
    })
  );
}

module.exports = logger;
