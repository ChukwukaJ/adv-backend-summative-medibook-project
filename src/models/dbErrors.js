'use strict';

const { conflictError } = require('../utils/errors');

const isDuplicateEntry = (error) => error && error.code === 'ER_DUP_ENTRY';
const isReferencedRow = (error) => error && error.code === 'ER_ROW_IS_REFERENCED_2';
const isMissingReference = (error) => error && error.code === 'ER_NO_REFERENCED_ROW_2';

/** Translates the constraint violations a model can predict into 409 conflicts. */
const translateConstraintError = (error, { duplicate, referenced }) => {
  if (duplicate && isDuplicateEntry(error)) return conflictError('DUPLICATE_RESOURCE', duplicate);
  if (referenced && isReferencedRow(error)) return conflictError('RESOURCE_IN_USE', referenced);
  return error;
};

module.exports = { translateConstraintError, isDuplicateEntry, isMissingReference };
