'use strict';

const pool = require('../config/db');
const { APPOINTMENT_STATUS } = require('../config/constants');

// "Revenue collected" is money kept: amount paid minus whatever was refunded.

/** Lifetime revenue, upcoming count and utilisation over the window, aggregated in SQL. */
const getDoctorSummary = async ({ doctorId, now, windowEnd, windowDays, dailyCap }) => {
  const [rows] = await pool.execute(
    `SELECT s.revenueCollected, s.upcomingAppointments, s.windowAppointments,
            ROUND(100 * s.windowAppointments / (? * ?), 2) AS windowUtilizationPercent
     FROM (
       SELECT COALESCE(SUM(a.amount_paid - a.refund_amount), 0) AS revenueCollected,
              COUNT(CASE WHEN a.status = ? AND a.appointment_datetime > ? THEN 1 END) AS upcomingAppointments,
              COUNT(CASE WHEN a.status = ? AND a.appointment_datetime >= DATE(?)
                          AND a.appointment_datetime < ? THEN 1 END) AS windowAppointments
       FROM appointments a
       WHERE a.doctor_id = ?
     ) s`,
    [windowDays, dailyCap, APPOINTMENT_STATUS.BOOKED, now, APPOINTMENT_STATUS.BOOKED, now, windowEnd, doctorId]
  );
  return rows[0];
};

/** One row per day for the window (zero-filled by a recursive calendar CTE). */
const getDoctorDailyCounts = async ({ doctorId, now, windowDays, dailyCap }) => {
  const [rows] = await pool.execute(
    `WITH RECURSIVE days AS (
       SELECT DATE(?) AS day, 1 AS n
       UNION ALL
       SELECT day + INTERVAL 1 DAY, n + 1 FROM days WHERE n < ?
     )
     SELECT days.day AS date,
            COUNT(a.id) AS appointments,
            ROUND(100 * COUNT(a.id) / ?, 2) AS utilizationPercent
     FROM days
     LEFT JOIN appointments a
            ON a.doctor_id = ?
           AND a.status = ?
           AND a.appointment_datetime >= days.day
           AND a.appointment_datetime < days.day + INTERVAL 1 DAY
     GROUP BY days.day
     ORDER BY days.day`,
    [now, windowDays, dailyCap, doctorId, APPOINTMENT_STATUS.BOOKED]
  );
  return rows;
};

/** LEFT JOIN keeps doctors that have no appointments at all. */
const getDoctorsReport = async () => {
  const [rows] = await pool.execute(
    `SELECT d.id AS doctorId, d.full_name AS doctorName, d.specialty,
            COUNT(CASE WHEN a.status = ? THEN 1 END) AS totalAppointments,
            COUNT(CASE WHEN a.status = ? THEN 1 END) AS cancelledAppointments,
            COALESCE(SUM(a.amount_paid - a.refund_amount), 0) AS revenueCollected
     FROM doctors d
     LEFT JOIN appointments a ON a.doctor_id = d.id
     GROUP BY d.id, d.full_name, d.specialty
     ORDER BY revenueCollected DESC, d.id`,
    [APPOINTMENT_STATUS.BOOKED, APPOINTMENT_STATUS.CANCELLED]
  );
  return rows;
};

/** Doctor-days where booked appointments exceed thresholdPercent of the daily capacity. */
const getBusyDays = async ({ dailyCap, thresholdPercent }) => {
  const [rows] = await pool.execute(
    `SELECT d.id AS doctorId, d.full_name AS doctorName,
            DATE(a.appointment_datetime) AS date,
            COUNT(*) AS bookedAppointments,
            ROUND(100 * COUNT(*) / ?, 2) AS utilizationPercent
     FROM appointments a
     JOIN doctors d ON d.id = a.doctor_id
     WHERE a.status = ?
     GROUP BY d.id, d.full_name, DATE(a.appointment_datetime)
     HAVING COUNT(*) * 100 > ? * ?
     ORDER BY date, d.id`,
    [dailyCap, APPOINTMENT_STATUS.BOOKED, thresholdPercent, dailyCap]
  );
  return rows;
};

module.exports = { getDoctorSummary, getDoctorDailyCounts, getDoctorsReport, getBusyDays };
