'use strict';

const { Router } = require('express');
const waitlistController = require('../controllers/waitlistController');

const router = Router();
router.route('/').get(waitlistController.list).post(waitlistController.join);
router.get('/failed', waitlistController.listFailed);

module.exports = router;
