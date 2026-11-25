'use strict';

const { Router } = require('express');
const appointmentController = require('../controllers/appointmentController');

const router = Router();
router.route('/').get(appointmentController.list).post(appointmentController.book);
router.route('/:id').get(appointmentController.get).delete(appointmentController.cancel);

module.exports = router;
