'use strict';

class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const validationError = (message, details) => new AppError(400, 'VALIDATION_ERROR', message, details);
const notFoundError = (message) => new AppError(404, 'NOT_FOUND', message);
const conflictError = (code, message, details) => new AppError(409, code, message, details);
const unprocessableError = (code, message) => new AppError(422, code, message);

module.exports = {
  AppError,
  validationError,
  notFoundError,
  conflictError,
  unprocessableError,
};
