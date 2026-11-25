'use strict';

const { validationError, notFoundError } = require('../utils/errors');
const { parseIdParam } = require('../utils/validators');

/** Builds list/get/create/replace/modify/remove handlers for a model + validator pair. */
const createCrudController = ({ model, validate, label, basePath }) => {
  const requireExisting = async (rawId) => {
    const id = parseIdParam(rawId);
    const record = await model.findById(id);
    if (!record) throw notFoundError(`${label} ${id} not found`);
    return record;
  };

  const validated = (input) => {
    const { valid, errors, value } = validate(input);
    if (!valid) throw validationError('Validation failed', errors);
    return value;
  };

  const list = async (req, res) => {
    res.json(await model.findAll());
  };

  const get = async (req, res) => {
    res.json(await requireExisting(req.params.id));
  };

  const create = async (req, res) => {
    const id = await model.create(validated(req.body));
    res.status(201).location(`${basePath}/${id}`).json(await model.findById(id));
  };

  const replace = async (req, res) => {
    const existing = await requireExisting(req.params.id);
    await model.update(existing.id, validated(req.body));
    res.json(await model.findById(existing.id));
  };

  const modify = async (req, res) => {
    const existing = await requireExisting(req.params.id);
    const changes = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    await model.update(existing.id, validated({ ...existing, ...changes }));
    res.json(await model.findById(existing.id));
  };

  const remove = async (req, res) => {
    const existing = await requireExisting(req.params.id);
    await model.remove(existing.id);
    res.status(204).end();
  };

  return { list, get, create, replace, modify, remove };
};

module.exports = { createCrudController };
