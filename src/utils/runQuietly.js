'use strict';

/** Runs a best-effort side effect (e.g. enqueueing a job) and reports, but never propagates, failure. */
const runQuietly = async (label, task) => {
  try {
    return await task();
  } catch (error) {
    console.error(`${label} failed:`, error.message);
    return undefined;
  }
};

module.exports = { runQuietly };
