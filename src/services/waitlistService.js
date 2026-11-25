'use strict';

const { DAILY_APPOINTMENT_CAP, WAITLIST_REASON } = require('../config/constants');
const appointmentModel = require('../models/appointmentModel');
const { AppError, conflictError } = require('../utils/errors');
const { formatClinicDateTime, parseClinicDateTime, startOfDay, startOfNextDay } = require('../utils/dateTime');
const { logEvent } = require('../utils/auditLogger');
const appointmentService = require('./appointmentService');
const waitlistStore = require('../queues/waitlistStore');

const dateOf = (clinicDateTime) => clinicDateTime.slice(0, 10);

const generateEntryId = () => `wl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const joinWaitlist = async ({ patientId, doctorId, datetime }, { now = new Date() } = {}) => {
  const slotDate = appointmentService.assertValidSlot(datetime, now);
  await appointmentService.assertPartiesExist(patientId, doctorId);

  const availability = await appointmentModel.getAvailability({
    doctorId,
    slotDate,
    dayStart: startOfDay(slotDate),
    dayEnd: startOfNextDay(slotDate),
  });
  const slotTaken = availability.slotHolderPatientId !== null;
  const dayFull = availability.bookedToday >= DAILY_APPOINTMENT_CAP;

  if (!slotTaken && !dayFull) {
    throw conflictError('SLOT_AVAILABLE', 'That slot is still available - book it directly instead of joining the waitlist');
  }
  if (availability.slotHolderPatientId === patientId) {
    throw conflictError('ALREADY_BOOKED', 'This patient already holds that slot');
  }

  const requestedSlot = formatClinicDateTime(slotDate);
  const existing = await waitlistStore.list(doctorId, dateOf(requestedSlot));
  if (existing.some(({ entry }) => entry.patientId === patientId && entry.requestedSlot === requestedSlot)) {
    throw conflictError('ALREADY_WAITLISTED', 'This patient is already on the waitlist for that slot');
  }

  const entry = {
    entryId: generateEntryId(),
    patientId,
    doctorId,
    requestedSlot,
    reason: slotTaken ? WAITLIST_REASON.SLOT_TAKEN : WAITLIST_REASON.DAY_FULL,
    joinedAt: now.toISOString(),
  };
  const position = await waitlistStore.add(entry);
  await logEvent('WAITLIST_JOINED', { ...entry });
  return { entry, position };
};

/** A slot-specific entry waits for exactly its slot; a day-full entry takes any freed capacity that day. */
const matchesFreedSlot = (entry, freedSlot) =>
  entry.reason === WAITLIST_REASON.DAY_FULL || entry.requestedSlot === freedSlot;

const isFulfilledAlready = async (entry, slotDate) => {
  const availability = await appointmentModel.getAvailability({
    doctorId: entry.doctorId,
    slotDate,
    dayStart: startOfDay(slotDate),
    dayEnd: startOfNextDay(slotDate),
  });
  return availability.slotHolderPatientId === entry.patientId;
};

/**
 * Called by the worker after a cancellation. Walks the day's queue in FIFO order and books the first
 * entry that can take the freed capacity. An entry leaves the Redis list only AFTER its booking has
 * committed (or is parked on the failed list with a reason), so a failed promotion can never lose the patient.
 *   - 409 (slot/day taken again): the entry stays queued and the next candidate is tried.
 *   - 400/404/422 (patient deleted, slot now invalid...): permanent, entry is moved to waitlist:failed.
 *   - anything else (DB/Redis hiccup): rethrown so BullMQ retries; the entry is still queued.
 */
const promoteForFreedSlot = async ({ doctorId, freedSlot }, { now = new Date() } = {}) => {
  const date = dateOf(freedSlot);
  const queued = await waitlistStore.list(doctorId, date);

  for (const { raw, entry } of queued.filter(({ entry: candidate }) => matchesFreedSlot(candidate, freedSlot))) {
    const targetSlot = entry.reason === WAITLIST_REASON.DAY_FULL ? entry.requestedSlot : freedSlot;
    const targetDate = parseClinicDateTime(targetSlot);

    if (await isFulfilledAlready(entry, targetDate)) {
      await waitlistStore.remove(doctorId, date, raw);
      continue;
    }

    try {
      const appointment = await appointmentService.bookAppointment(
        { patientId: entry.patientId, doctorId, datetime: targetSlot },
        { now, source: 'waitlist' }
      );
      await waitlistStore.remove(doctorId, date, raw);
      await logEvent('WAITLIST_PROMOTED', { entryId: entry.entryId, appointmentId: appointment.id, patientId: entry.patientId, doctorId });
      return { promoted: appointment };
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      if (error.status === 409) continue;
      await waitlistStore.moveToFailed(doctorId, date, raw, error.code);
      await logEvent('WAITLIST_PROMOTION_FAILED', { entryId: entry.entryId, patientId: entry.patientId, doctorId, failureCode: error.code });
    }
  }
  return { promoted: null };
};

const listQueue = async (doctorId, date) => (await waitlistStore.list(doctorId, date)).map(({ entry }) => entry);

const listFailed = () => waitlistStore.listFailed();

module.exports = { joinWaitlist, promoteForFreedSlot, listQueue, listFailed };
