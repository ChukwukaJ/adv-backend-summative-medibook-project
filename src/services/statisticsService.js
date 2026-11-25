'use strict';

const { DAILY_APPOINTMENT_CAP, STATS_WINDOW_DAYS, BUSY_DAY_THRESHOLD_PERCENT } = require('../config/constants');
const doctorModel = require('../models/doctorModel');
const reportModel = require('../models/reportModel');
const { notFoundError } = require('../utils/errors');
const { startOfDay, formatClinicDate } = require('../utils/dateTime');

// All figures are produced by SQL in reportModel; this layer only shapes the response.

const getDoctorStatistics = async (doctorId, { now = new Date() } = {}) => {
  const doctor = await doctorModel.findById(doctorId);
  if (!doctor) throw notFoundError(`Doctor ${doctorId} not found`);

  const today = startOfDay(now);
  const windowEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + STATS_WINDOW_DAYS);
  const query = { doctorId, now, windowDays: STATS_WINDOW_DAYS, dailyCap: DAILY_APPOINTMENT_CAP };

  const [summary, daily] = await Promise.all([
    reportModel.getDoctorSummary({ ...query, windowEnd }),
    reportModel.getDoctorDailyCounts(query),
  ]);

  return {
    doctor: { id: doctor.id, fullName: doctor.fullName, specialty: doctor.specialty },
    revenueCollected: summary.revenueCollected,
    upcomingAppointments: summary.upcomingAppointments,
    dailyCapacity: DAILY_APPOINTMENT_CAP,
    nextSevenDays: {
      from: formatClinicDate(today),
      appointmentsPerDay: daily,
      totalAppointments: summary.windowAppointments,
      utilizationPercent: summary.windowUtilizationPercent,
    },
  };
};

const getDoctorsReport = () => reportModel.getDoctorsReport();

const getBusyDaysReport = async () => ({
  thresholdPercent: BUSY_DAY_THRESHOLD_PERCENT,
  dailyCapacity: DAILY_APPOINTMENT_CAP,
  busyDays: await reportModel.getBusyDays({
    dailyCap: DAILY_APPOINTMENT_CAP,
    thresholdPercent: BUSY_DAY_THRESHOLD_PERCENT,
  }),
});

module.exports = { getDoctorStatistics, getDoctorsReport, getBusyDaysReport };
