'use strict';

const { APPOINTMENT_STATUS } = require('../config/constants');
const { validationError } = require('./errors');
const { parseClinicDate, startOfNextDay } = require('./dateTime');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+()\-\s]{7,20}$/;
const MAX_FEE = 99999999.99;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const requireText = (body, field, maxLength, errors) => {
  const raw = body[field];
  if (typeof raw !== 'string' || raw.trim() === '') {
    errors.push(`${field} is required and must be a non-empty string`);
    return undefined;
  }
  const value = raw.trim();
  if (value.length > maxLength) {
    errors.push(`${field} must be at most ${maxLength} characters`);
    return undefined;
  }
  return value;
};

const toResult = (errors, value) => ({ valid: errors.length === 0, errors, value });

const validatePatientInput = (body) => {
  const errors = [];
  if (!isPlainObject(body)) return toResult(['request body must be a JSON object'], {});

  const fullName = requireText(body, 'fullName', 100, errors);
  const email = requireText(body, 'email', 255, errors);
  const phone = requireText(body, 'phone', 20, errors);

  if (email !== undefined && !EMAIL_PATTERN.test(email)) errors.push('email must be a valid email address');
  if (phone !== undefined && !PHONE_PATTERN.test(phone)) {
    errors.push('phone must be 7-20 characters of digits, spaces, +, ( ) or -');
  }

  return toResult(errors, { fullName, email: email && email.toLowerCase(), phone });
};

const hasAtMostTwoDecimals = (number) => Math.abs(number * 100 - Math.round(number * 100)) < 1e-6;

const validateDoctorInput = (body) => {
  const errors = [];
  if (!isPlainObject(body)) return toResult(['request body must be a JSON object'], {});

  const fullName = requireText(body, 'fullName', 100, errors);
  const specialty = requireText(body, 'specialty', 100, errors);
  const room = requireText(body, 'room', 20, errors);

  const fee = body.consultationFee;
  if (typeof fee !== 'number' || !Number.isFinite(fee) || fee < 0 || fee > MAX_FEE || !hasAtMostTwoDecimals(fee)) {
    errors.push('consultationFee is required and must be a number from 0 to 99999999.99 with at most 2 decimals');
  }

  return toResult(errors, { fullName, specialty, room, consultationFee: fee });
};

const validateBookingInput = (body) => {
  const errors = [];
  if (!isPlainObject(body)) return toResult(['request body must be a JSON object'], {});

  ['patientId', 'doctorId'].forEach((field) => {
    if (!Number.isInteger(body[field]) || body[field] <= 0) {
      errors.push(`${field} is required and must be a positive integer`);
    }
  });
  if (typeof body.datetime !== 'string' || body.datetime.trim() === '') {
    errors.push('datetime is required (YYYY-MM-DD HH:MM)');
  }

  return toResult(errors, {
    patientId: body.patientId,
    doctorId: body.doctorId,
    datetime: typeof body.datetime === 'string' ? body.datetime.trim() : undefined,
  });
};

/** Returns a positive integer id, or throws a 400 so the controller never queries with junk. */
const parseIdParam = (raw, label = 'id') => {
  if (!/^[1-9]\d{0,9}$/.test(String(raw))) {
    throw validationError(`${label} must be a positive integer`);
  }
  return Number(raw);
};

/** Turns optional ?doctorId=&patientId=&status=&date= query params into model filters (null = no filter). */
const parseAppointmentFilters = (query) => {
  const filters = { doctorId: null, patientId: null, status: null, from: null, to: null };
  if (query.doctorId !== undefined) filters.doctorId = parseIdParam(query.doctorId, 'doctorId');
  if (query.patientId !== undefined) filters.patientId = parseIdParam(query.patientId, 'patientId');
  if (query.status !== undefined) {
    if (!Object.values(APPOINTMENT_STATUS).includes(query.status)) {
      throw validationError(`status must be one of: ${Object.values(APPOINTMENT_STATUS).join(', ')}`);
    }
    filters.status = query.status;
  }
  if (query.date !== undefined) {
    const day = parseClinicDate(String(query.date));
    if (!day) throw validationError('date must be a real date in the form YYYY-MM-DD');
    filters.from = day;
    filters.to = startOfNextDay(day);
  }
  return filters;
};

module.exports = {
  validatePatientInput,
  validateDoctorInput,
  validateBookingInput,
  parseIdParam,
  parseAppointmentFilters,
};
