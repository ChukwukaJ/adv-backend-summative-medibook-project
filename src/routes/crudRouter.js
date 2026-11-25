'use strict';

const { Router } = require('express');

/** Standard REST routes for a controller produced by createCrudController. */
const createCrudRouter = (controller) => {
  const router = Router();
  router.route('/').get(controller.list).post(controller.create);
  router.route('/:id').get(controller.get).put(controller.replace).patch(controller.modify).delete(controller.remove);
  return router;
};

module.exports = { createCrudRouter };
