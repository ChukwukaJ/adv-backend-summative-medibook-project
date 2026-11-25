'use strict';

const { SLOT_MINUTES, WORKING_HOURS } = require('../config/constants');
const { parseClinicDateTime } = require('./dateTime');

const SLOT_ERRORS = Object.freeze({
  MALFORMED: { code: 'MALFORMED_DATETIME', httpStatus: 400 },
  NOT_ON_BOUNDARY: { code: 'SLOT_NOT_ON_BOUNDARY', httpStatus: 422 },
  OUTSIDE_HOURS: { code: 'OUTSIDE_WORKING_HOURS', httpStatus: 422 },
  NOT_IN_FUTURE: { code: 'SLOT_NOT_IN_FUTURE', httpStatus: 422 },
});

const fail = (error, message) => ({ valid: false, ...error, message });

/**
 * Pure booking-time check: well-formed, on a 30-minute boundary, inside working hours
 * (a slot must also END by closing time, so the last start is 16:30) and strictly in the future.
 */
const validateBookingSlot = (value, now) => {
  const date = parseClinicDateTime(value);
  if (!date) {
    return fail(SLOT_ERRORS.MALFORMED, 'datetime must be a real date in the form YYYY-MM-DD HH:MM');
  }

  const minutesIntoDay = date.getHours() * 60 + date.getMinutes();
  if (date.getSeconds() !== 0 || minutesIntoDay % SLOT_MINUTES !== 0) {
    return fail(SLOT_ERRORS.NOT_ON_BOUNDARY, `appointments start on a ${SLOT_MINUTES}-minute boundary (e.g. 09:00, 09:30)`);
  }

  const lastStart = WORKING_HOURS.endMinutes - SLOT_MINUTES;
  if (minutesIntoDay < WORKING_HOURS.startMinutes || minutesIntoDay > lastStart) {
    return fail(SLOT_ERRORS.OUTSIDE_HOURS, 'appointments must fall within working hours (09:00-17:00)');
  }

  if (date.getTime() <= now.getTime()) {
    return fail(SLOT_ERRORS.NOT_IN_FUTURE, 'appointments can only be booked in the future');
  }

  return { valid: true, date };
};

module.exports = { validateBookingSlot, SLOT_ERRORS };
