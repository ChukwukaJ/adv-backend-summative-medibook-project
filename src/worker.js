'use strict';

// Separate process from the web server:  npm run worker
const { Worker } = require('bullmq');
const { QUEUE_NAMES } = require('./config/constants');
const pool = require('./config/db');
const { createRedisConnection } = require('./queues/connection');
const waitlistStore = require('./queues/waitlistStore');
const waitlistService = require('./services/waitlistService');
const { buildConfirmationMessages } = require('./utils/notifications');
const { ensureLogDirectory, logEvent } = require('./utils/auditLogger');

const processConfirmation = async (job) => {
  const messages = buildConfirmationMessages(job.data);
  for (const message of messages) {
    await logEvent('CONFIRMATION_SENT', { appointmentId: job.data.appointmentId, ...message });
  }
};

const processPromotion = async (job) => waitlistService.promoteForFreedSlot(job.data);

const start = async () => {
  await ensureLogDirectory();

  // BullMQ workers need blocking connections without a per-request retry limit.
  const workerConnection = () => createRedisConnection({ maxRetriesPerRequest: null });

  const workers = [
    new Worker(QUEUE_NAMES.NOTIFICATION, processConfirmation, { connection: workerConnection(), concurrency: 5 }),
    // Concurrency 1: promotions for one doctor-day must not race on the same waitlist entry.
    new Worker(QUEUE_NAMES.PROMOTION, processPromotion, { connection: workerConnection(), concurrency: 1 }),
  ];

  workers.forEach((worker) => {
    worker.on('failed', (job, error) => console.error(`${worker.name} job ${job && job.id} failed:`, error.message));
    worker.on('error', (error) => console.error(`${worker.name} worker error:`, error.message));
  });
  console.log('MediBook worker started (notifications, waitlist promotion)');

  const shutdown = async () => {
    await Promise.allSettled(workers.map((worker) => worker.close()));
    await Promise.allSettled([pool.end(), waitlistStore.close()]);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

start().catch((error) => {
  console.error('Failed to start worker:', error);
  process.exit(1);
});
