'use strict';

const mysql = require('mysql2/promise');
const env = require('./env');

// dateStrings keeps DATETIME values as clinic-local wall-clock strings (no timezone shifting).
const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  connectionLimit: env.db.poolSize,
  dateStrings: true,
  decimalNumbers: true,
  namedPlaceholders: false,
});

module.exports = pool;
