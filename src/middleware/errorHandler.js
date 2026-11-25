'use strict';

const { AppError, notFoundError } = require('../utils/errors');

const notFoundHandler = (req) => {
  throw notFoundError(`Route ${req.method} ${req.originalUrl} not found`);
};

// Express 5 forwards rejected promises here, so controllers need no try/catch.
// eslint-disable-next-line no-unused-vars
const errorHandler = (error, req, res, next) => {
  if (error instanceof AppError) {
    return res.status(error.status).json({
      error: { code: error.code, message: error.message, ...(error.details && { details: error.details }) },
    });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'MALFORMED_JSON', message: 'Request body is not valid JSON' } });
  }
  console.error('Unhandled error:', error);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
};

module.exports = { errorHandler, notFoundHandler };
