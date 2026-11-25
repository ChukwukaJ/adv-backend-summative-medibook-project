'use strict';

const doctorModel = require('../models/doctorModel');
const statisticsService = require('../services/statisticsService');
const { validateDoctorInput, parseIdParam } = require('../utils/validators');
const { createCrudController } = require('./crudControllerFactory');

const crud = createCrudController({
  model: doctorModel,
  validate: validateDoctorInput,
  label: 'Doctor',
  basePath: '/api/doctors',
});

const statistics = async (req, res) => {
  res.json(await statisticsService.getDoctorStatistics(parseIdParam(req.params.id)));
};

module.exports = { ...crud, statistics };
