'use strict';

const patientController = require('../controllers/patientController');
const { createCrudRouter } = require('./crudRouter');

module.exports = createCrudRouter(patientController);
