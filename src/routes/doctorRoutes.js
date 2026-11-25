'use strict';

const doctorController = require('../controllers/doctorController');
const { createCrudRouter } = require('./crudRouter');

const router = createCrudRouter(doctorController);
router.get('/:id/statistics', doctorController.statistics);

module.exports = router;
