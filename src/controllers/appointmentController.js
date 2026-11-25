'use strict';

const appointmentModel = require('../models/appointmentModel');
const appointmentService = require('../services/appointmentService');
const { validationError } = require('../utils/errors');
const { validateBookingInput, parseIdParam, parseAppointmentFilters } = require('../utils/validators');

const list = async (req, res) => {
  res.json(await appointmentModel.findAll(parseAppointmentFilters(req.query)));
};

const get = async (req, res) => {
  res.json(await appointmentService.getAppointment(parseIdParam(req.params.id)));
};

const book = async (req, res) => {
  const { valid, errors, value } = validateBookingInput(req.body);
  if (!valid) throw validationError('Validation failed', errors);
  const appointment = await appointmentService.bookAppointment(value);
  res.status(201).location(`/api/appointments/${appointment.id}`).json(appointment);
};

// DELETE cancels: the row is kept (status = cancelled) so refund history survives, hence 200 + body rather than 204.
const cancel = async (req, res) => {
  const { appointment, refund } = await appointmentService.cancelAppointment(parseIdParam(req.params.id));
  res.json({
    message: `Appointment cancelled. Refund: ${refund.amount.toFixed(2)} (${refund.percent}%)`,
    refund,
    appointment,
  });
};

module.exports = { list, get, book, cancel };
