'use strict';

// Single source of truth for every business rule value.

const DAILY_APPOINTMENT_CAP = 12;
const SLOT_MINUTES = 30;

const WORKING_HOURS = Object.freeze({
  startMinutes: 9 * 60,
  endMinutes: 17 * 60,
});

// Policy: more than 48h -> 100%, from 24h up to and including 48h -> 50%, under 24h -> 0%.
// Tiers are checked top to bottom; `inclusive` decides whether the exact boundary qualifies.
const REFUND_TIERS = Object.freeze([
  Object.freeze({ minHours: 48, inclusive: false, percent: 100 }),
  Object.freeze({ minHours: 24, inclusive: true, percent: 50 }),
]);
const DEFAULT_REFUND_PERCENT = 0;

const BUSY_DAY_THRESHOLD_PERCENT = 80;
const STATS_WINDOW_DAYS = 7;

const APPOINTMENT_STATUS = Object.freeze({
  BOOKED: 'booked',
  CANCELLED: 'cancelled',
});

const WAITLIST_REASON = Object.freeze({
  SLOT_TAKEN: 'SLOT_TAKEN',
  DAY_FULL: 'DAY_FULL',
});

const QUEUE_NAMES = Object.freeze({
  PROMOTION: 'waitlist-promotion',
  NOTIFICATION: 'notifications',
});

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

module.exports = {
  DAILY_APPOINTMENT_CAP,
  SLOT_MINUTES,
  WORKING_HOURS,
  REFUND_TIERS,
  DEFAULT_REFUND_PERCENT,
  BUSY_DAY_THRESHOLD_PERCENT,
  STATS_WINDOW_DAYS,
  APPOINTMENT_STATUS,
  WAITLIST_REASON,
  QUEUE_NAMES,
  MS_PER_HOUR,
  MS_PER_MINUTE,
};
