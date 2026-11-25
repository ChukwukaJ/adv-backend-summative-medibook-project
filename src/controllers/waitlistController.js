'use strict';

const waitlistService = require('../services/waitlistService');
const { validationError } = require('../utils/errors');
const { parseClinicDate, formatClinicDate } = require('../utils/dateTime');
const { validateBookingInput, parseIdParam } = require('../utils/validators');

const join = async (req, res) => {
  const { valid, errors, value } = validateBookingInput(req.body);
  if (!valid) throw validationError('Validation failed', errors);
  const { entry, position } = await waitlistService.joinWaitlist(value);
  res.status(201).json({ message: 'Added to the waitlist', position, entry });
};

const list = async (req, res) => {
  const doctorId = parseIdParam(req.query.doctorId, 'doctorId');
  const day = parseClinicDate(String(req.query.date));
  if (!day) throw validationError('date is required in the form YYYY-MM-DD');
  res.json(await waitlistService.listQueue(doctorId, formatClinicDate(day)));
};

const listFailed = async (req, res) => {
  res.json(await waitlistService.listFailed());
};

module.exports = { join, list, listFailed };
