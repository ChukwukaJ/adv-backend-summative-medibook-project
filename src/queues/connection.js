'use strict';

const IORedis = require('ioredis');
const env = require('../config/env');

const createRedisConnection = (options = {}) => {
  const connection = new IORedis({
    host: env.redis.host,
    port: env.redis.port,
    password: env.redis.password,
    ...options,
  });
  connection.on('error', (error) => console.error('Redis error:', error.message));
  return connection;
};

module.exports = { createRedisConnection };
