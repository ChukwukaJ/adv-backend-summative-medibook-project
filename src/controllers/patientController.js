'use strict';

const patientModel = require('../models/patientModel');
const { validatePatientInput } = require('../utils/validators');
const { createCrudController } = require('./crudControllerFactory');

module.exports = createCrudController({
  model: patientModel,
  validate: validatePatientInput,
  label: 'Patient',
  basePath: '/api/patients',
});
