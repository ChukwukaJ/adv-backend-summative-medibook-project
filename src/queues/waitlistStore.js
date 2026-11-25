'use strict';

const { createRedisConnection } = require('./connection');

// One Redis list per doctor and day (FIFO). Entries are JSON strings.
// Permanently failed promotions are moved to a dead-letter list, never discarded.
const FAILED_KEY = 'waitlist:failed';
const queueKey = (doctorId, date) => `waitlist:${doctorId}:${date}`;

let client = null;
const redis = () => {
  if (!client) client = createRedisConnection({ maxRetriesPerRequest: 2 });
  return client;
};

const parseEntries = (rawEntries) => rawEntries.map((raw) => ({ raw, entry: JSON.parse(raw) }));

/** Appends an entry and returns its 1-based position in the queue. */
const add = async (entry) => redis().rpush(queueKey(entry.doctorId, entry.requestedSlot.slice(0, 10)), JSON.stringify(entry));

const list = async (doctorId, date) => parseEntries(await redis().lrange(queueKey(doctorId, date), 0, -1));

const remove = async (doctorId, date, raw) => redis().lrem(queueKey(doctorId, date), 1, raw);

/** Atomically takes the entry off its queue and parks it, with the reason, on the failed list. */
const moveToFailed = async (doctorId, date, raw, failureCode) => {
  const failedRecord = JSON.stringify({ ...JSON.parse(raw), failureCode, failedAt: new Date().toISOString() });
  await redis().multi().lrem(queueKey(doctorId, date), 1, raw).rpush(FAILED_KEY, failedRecord).exec();
};

const listFailed = async () => (await redis().lrange(FAILED_KEY, 0, -1)).map((raw) => JSON.parse(raw));

const close = async () => {
  if (client) {
    await client.quit();
    client = null;
  }
};

module.exports = { add, list, remove, moveToFailed, listFailed, close };
