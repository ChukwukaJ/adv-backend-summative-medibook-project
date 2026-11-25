'use strict';

const statisticsService = require('../services/statisticsService');

const doctors = async (req, res) => {
  res.json(await statisticsService.getDoctorsReport());
};

const busyDays = async (req, res) => {
  res.json(await statisticsService.getBusyDaysReport());
};

module.exports = { doctors, busyDays };
