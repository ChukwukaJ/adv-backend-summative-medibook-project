'use strict';

const { DAILY_APPOINTMENT_CAP, WAITLIST_REASON } = require('../config/constants');
const appointmentModel = require('../models/appointmentModel');
const doctorModel = require('../models/doctorModel');
const patientModel = require('../models/patientModel');
const { AppError, notFoundError, conflictError, unprocessableError } = require('../utils/errors');
const { parseClinicDateTime, startOfDay, startOfNextDay } = require('../utils/dateTime');
const { validateBookingSlot } = require('../utils/slotValidation');
const { calculateRefund } = require('../utils/refund');
const { logEvent } = require('../utils/auditLogger');
const { runQuietly } = require('../utils/runQuietly');
const { enqueueConfirmation, enqueuePromotion } = require('../queues/producers');

const { BOOKING_OUTCOME, CANCEL_OUTCOME } = appointmentModel;

const waitlistOffer = (reason, { patientId, doctorId, datetime }) => ({
  available: true,
  reason,
  method: 'POST',
  url: '/api/waitlist',
  body: { patientId, doctorId, datetime },
});

const assertValidSlot = (datetime, now) => {
  const slot = validateBookingSlot(datetime, now);
  if (!slot.valid) throw new AppError(slot.httpStatus, slot.code, slot.message);
  return slot.date;
};

const assertPartiesExist = async (patientId, doctorId) => {
  const [patient, doctor] = await Promise.all([patientModel.findById(patientId), doctorModel.findById(doctorId)]);
  if (!patient) throw notFoundError(`Patient ${patientId} not found`);
  if (!doctor) throw notFoundError(`Doctor ${doctorId} not found`);
};

const outcomeToError = (outcome, input) => {
  switch (outcome) {
    case BOOKING_OUTCOME.SLOT_TAKEN:
      return conflictError('SLOT_TAKEN', 'That slot is already booked for this doctor', {
        waitlist: waitlistOffer(WAITLIST_REASON.SLOT_TAKEN, input),
      });
    case BOOKING_OUTCOME.DAY_FULL:
      return conflictError(
        'DAY_FULL',
        `This doctor already has ${DAILY_APPOINTMENT_CAP} appointments on that day`,
        { waitlist: waitlistOffer(WAITLIST_REASON.DAY_FULL, input) }
      );
    case BOOKING_OUTCOME.DOCTOR_NOT_FOUND:
      return notFoundError(`Doctor ${input.doctorId} not found`);
    default:
      return notFoundError(`Patient ${input.patientId} not found`);
  }
};

const bookAppointment = async ({ patientId, doctorId, datetime }, { now = new Date(), source = 'api' } = {}) => {
  const slotDate = assertValidSlot(datetime, now);
  await assertPartiesExist(patientId, doctorId);

  const result = await appointmentModel.createBooking({
    patientId,
    doctorId,
    slotDate,
    dayStart: startOfDay(slotDate),
    dayEnd: startOfNextDay(slotDate),
    dailyCap: DAILY_APPOINTMENT_CAP,
  });
  if (result.outcome !== BOOKING_OUTCOME.CREATED) {
    throw outcomeToError(result.outcome, { patientId, doctorId, datetime });
  }

  const appointment = await appointmentModel.findById(result.id);
  await logEvent('BOOKING_CREATED', {
    appointmentId: appointment.id,
    patientId,
    doctorId,
    appointmentDatetime: appointment.appointmentDatetime,
    amountPaid: appointment.amountPaid,
    source,
  });
  await runQuietly('Enqueue confirmation job', () => enqueueConfirmation(appointment));
  return appointment;
};

const cancelAppointment = async (id, { now = new Date() } = {}) => {
  const decideRefund = (row) => {
    const appointmentDate = parseClinicDateTime(row.appointmentDatetime);
    if (appointmentDate.getTime() <= now.getTime()) {
      throw unprocessableError('APPOINTMENT_ALREADY_STARTED', 'Appointments that have already started cannot be cancelled');
    }
    return calculateRefund({ amountPaid: row.amountPaid, appointmentDate, cancelledAt: now });
  };

  const result = await appointmentModel.cancelWithRefund(id, { cancelledAt: now, decideRefund });
  if (result.outcome === CANCEL_OUTCOME.NOT_FOUND) throw notFoundError(`Appointment ${id} not found`);
  if (result.outcome === CANCEL_OUTCOME.ALREADY_CANCELLED) {
    throw conflictError('ALREADY_CANCELLED', `Appointment ${id} is already cancelled`);
  }

  const appointment = await appointmentModel.findById(id);
  const refund = {
    percent: result.refund.refundPercent,
    amount: result.refund.refundAmount,
    noticeHours: result.refund.noticeHours,
  };
  await logEvent('APPOINTMENT_CANCELLED', {
    appointmentId: id,
    patientId: appointment.patientId,
    doctorId: appointment.doctorId,
    appointmentDatetime: appointment.appointmentDatetime,
    refundPercent: refund.percent,
    refundAmount: refund.amount,
  });
  await runQuietly('Notify waitlist', () =>
    enqueuePromotion({
      doctorId: appointment.doctorId,
      freedSlot: appointment.appointmentDatetime,
      cancelledAppointmentId: id,
    })
  );
  return { appointment, refund };
};

const getAppointment = async (id) => {
  const appointment = await appointmentModel.findById(id);
  if (!appointment) throw notFoundError(`Appointment ${id} not found`);
  return appointment;
};

module.exports = {
  bookAppointment,
  cancelAppointment,
  getAppointment,
  assertValidSlot,
  assertPartiesExist,
};
