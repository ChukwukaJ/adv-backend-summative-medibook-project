'use strict';

const app = require('./app');
const env = require('./config/env');
const pool = require('./config/db');
const { ensureLogDirectory } = require('./utils/auditLogger');
const { closeQueues } = require('./queues/producers');
const waitlistStore = require('./queues/waitlistStore');

const start = async () => {
  await ensureLogDirectory();
  const server = app.listen(env.port, () => console.log(`MediBook API listening on port ${env.port}`));

  const shutdown = async () => {
    server.close();
    await Promise.allSettled([pool.end(), closeQueues(), waitlistStore.close()]);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

start().catch((error) => {
  console.error('Failed to start MediBook:', error);
  process.exit(1);
});
