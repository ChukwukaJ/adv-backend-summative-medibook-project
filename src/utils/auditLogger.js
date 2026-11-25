'use strict';

const fs = require('fs/promises');
const path = require('path');
const env = require('../config/env');

const logDirectory = path.resolve(env.auditLogDir);
const logFile = path.join(logDirectory, 'audit.log');

let directoryReady = null;

const ensureLogDirectory = () => {
  if (!directoryReady) {
    directoryReady = fs.mkdir(logDirectory, { recursive: true }).catch((error) => {
      directoryReady = null;
      throw error;
    });
  }
  return directoryReady;
};

/**
 * Appends one JSON line to logs/audit.log. Fully async, and it never throws:
 * a logging failure must not fail the user's request.
 */
const logEvent = async (event, data = {}) => {
  try {
    await ensureLogDirectory();
    const line = JSON.stringify({ timestamp: new Date().toISOString(), event, ...data });
    await fs.appendFile(logFile, `${line}\n`, 'utf8');
  } catch (error) {
    console.error(`Audit log write failed (${event}):`, error.message);
  }
};

module.exports = { logEvent, ensureLogDirectory, logFile };
