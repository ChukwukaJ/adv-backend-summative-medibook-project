'use strict';

const pool = require('../config/db');
const { APPOINTMENT_STATUS } = require('../config/constants');
const { isDuplicateEntry, isMissingReference } = require('./dbErrors');

const SELECT_APPOINTMENT = `
  SELECT a.id,
         CONCAT('AP-', LPAD(a.id, 3, '0')) AS reference,
         a.patient_id AS patientId, p.full_name AS patientName,
         p.email AS patientEmail, p.phone AS patientPhone,
         a.doctor_id AS doctorId, d.full_name AS doctorName,
         d.specialty, d.room,
         a.appointment_datetime AS appointmentDatetime,
         a.status, a.amount_paid AS amountPaid, a.refund_amount AS refundAmount,
         a.booked_at AS bookedAt, a.cancelled_at AS cancelledAt
  FROM appointments a
  JOIN patients p ON p.id = a.patient_id
  JOIN doctors d ON d.id = a.doctor_id`;

const BOOKING_OUTCOME = Object.freeze({
  CREATED: 'CREATED',
  SLOT_TAKEN: 'SLOT_TAKEN',
  DAY_FULL: 'DAY_FULL',
  DOCTOR_NOT_FOUND: 'DOCTOR_NOT_FOUND',
  PATIENT_NOT_FOUND: 'PATIENT_NOT_FOUND',
});

const CANCEL_OUTCOME = Object.freeze({
  CANCELLED: 'CANCELLED',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_CANCELLED: 'ALREADY_CANCELLED',
});

const findById = async (id) => {
  const [rows] = await pool.execute(`${SELECT_APPOINTMENT} WHERE a.id = ?`, [id]);
  return rows[0] || null;
};

/** Every filter is optional: passing null disables it. */
const findAll = async ({ doctorId, patientId, status, from, to }) => {
  const [rows] = await pool.execute(
    `${SELECT_APPOINTMENT}
     WHERE (? IS NULL OR a.doctor_id = ?)
       AND (? IS NULL OR a.patient_id = ?)
       AND (? IS NULL OR a.status = ?)
       AND (? IS NULL OR a.appointment_datetime >= ?)
       AND (? IS NULL OR a.appointment_datetime < ?)
     ORDER BY a.appointment_datetime, a.id`,
    [doctorId, doctorId, patientId, patientId, status, status, from, from, to, to]
  );
  return rows;
};

/** Read-only snapshot used to decide whether a waitlist offer applies. */
const getAvailability = async ({ doctorId, slotDate, dayStart, dayEnd }) => {
  const [rows] = await pool.execute(
    `SELECT
       (SELECT patient_id FROM appointments WHERE doctor_id = ? AND active_slot = ?) AS slotHolderPatientId,
       (SELECT COUNT(*) FROM appointments
         WHERE doctor_id = ? AND status = ? AND appointment_datetime >= ? AND appointment_datetime < ?) AS bookedToday`,
    [doctorId, slotDate, doctorId, APPOINTMENT_STATUS.BOOKED, dayStart, dayEnd]
  );
  return rows[0];
};

const rollbackQuietly = async (connection) => {
  try {
    await connection.rollback();
  } catch (rollbackError) {
    console.error('Rollback failed:', rollbackError.message);
  }
};

/**
 * Books a slot atomically. Locking the doctor row serialises concurrent bookings for that doctor,
 * so the daily-cap check cannot race; the UNIQUE (doctor_id, active_slot) index is the final guard.
 */
const createBooking = async ({ patientId, doctorId, slotDate, dayStart, dayEnd, dailyCap }) => {
  const connection = await pool.getConnection();
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await connection.beginTransaction();

    const [doctors] = await connection.execute(
      'SELECT consultation_fee AS fee FROM doctors WHERE id = ? FOR UPDATE',
      [doctorId]
    );
    if (doctors.length === 0) {
      await connection.rollback();
      return { outcome: BOOKING_OUTCOME.DOCTOR_NOT_FOUND };
    }

    const [slotRows] = await connection.execute(
      'SELECT id FROM appointments WHERE doctor_id = ? AND active_slot = ?',
      [doctorId, slotDate]
    );
    if (slotRows.length > 0) {
      await connection.rollback();
      return { outcome: BOOKING_OUTCOME.SLOT_TAKEN };
    }

    const [countRows] = await connection.execute(
      `SELECT COUNT(*) AS booked FROM appointments
       WHERE doctor_id = ? AND status = ? AND appointment_datetime >= ? AND appointment_datetime < ?`,
      [doctorId, APPOINTMENT_STATUS.BOOKED, dayStart, dayEnd]
    );
    if (countRows[0].booked >= dailyCap) {
      await connection.rollback();
      return { outcome: BOOKING_OUTCOME.DAY_FULL };
    }

    const [result] = await connection.execute(
      'INSERT INTO appointments (patient_id, doctor_id, appointment_datetime, amount_paid) VALUES (?, ?, ?, ?)',
      [patientId, doctorId, slotDate, doctors[0].fee]
    );
    await connection.commit();
    return { outcome: BOOKING_OUTCOME.CREATED, id: result.insertId };
  } catch (error) {
    await rollbackQuietly(connection);
    if (isDuplicateEntry(error)) return { outcome: BOOKING_OUTCOME.SLOT_TAKEN };
    if (isMissingReference(error)) return { outcome: BOOKING_OUTCOME.PATIENT_NOT_FOUND };
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Cancels and records the refund in one transaction. `decideRefund(row)` is supplied by the
 * service (pure business rule) and may throw to abort; the row stays locked until commit.
 */
const cancelWithRefund = async (id, { cancelledAt, decideRefund }) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT id, status, appointment_datetime AS appointmentDatetime, amount_paid AS amountPaid
       FROM appointments WHERE id = ? FOR UPDATE`,
      [id]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return { outcome: CANCEL_OUTCOME.NOT_FOUND };
    }
    if (rows[0].status === APPOINTMENT_STATUS.CANCELLED) {
      await connection.rollback();
      return { outcome: CANCEL_OUTCOME.ALREADY_CANCELLED };
    }

    const refund = decideRefund(rows[0]);
    await connection.execute(
      'UPDATE appointments SET status = ?, refund_amount = ?, cancelled_at = ? WHERE id = ?',
      [APPOINTMENT_STATUS.CANCELLED, refund.refundAmount, cancelledAt, id]
    );
    await connection.commit();
    return { outcome: CANCEL_OUTCOME.CANCELLED, refund };
  } catch (error) {
    await rollbackQuietly(connection);
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  BOOKING_OUTCOME,
  CANCEL_OUTCOME,
  findById,
  findAll,
  getAvailability,
  createBooking,
  cancelWithRefund,
};
