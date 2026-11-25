'use strict';

const pool = require('../config/db');
const { translateConstraintError } = require('./dbErrors');

const SELECT_PATIENT = `
  SELECT id, full_name AS fullName, email, phone, created_at AS createdAt
  FROM patients`;

const DUPLICATE_MESSAGE = 'A patient with this email already exists';

const findAll = async () => {
  const [rows] = await pool.execute(`${SELECT_PATIENT} ORDER BY id`);
  return rows;
};

const findById = async (id) => {
  const [rows] = await pool.execute(`${SELECT_PATIENT} WHERE id = ?`, [id]);
  return rows[0] || null;
};

const create = async ({ fullName, email, phone }) => {
  try {
    const [result] = await pool.execute(
      'INSERT INTO patients (full_name, email, phone) VALUES (?, ?, ?)',
      [fullName, email, phone]
    );
    return result.insertId;
  } catch (error) {
    throw translateConstraintError(error, { duplicate: DUPLICATE_MESSAGE });
  }
};

const update = async (id, { fullName, email, phone }) => {
  try {
    await pool.execute(
      'UPDATE patients SET full_name = ?, email = ?, phone = ? WHERE id = ?',
      [fullName, email, phone, id]
    );
  } catch (error) {
    throw translateConstraintError(error, { duplicate: DUPLICATE_MESSAGE });
  }
};

const remove = async (id) => {
  try {
    const [result] = await pool.execute('DELETE FROM patients WHERE id = ?', [id]);
    return result.affectedRows > 0;
  } catch (error) {
    throw translateConstraintError(error, {
      referenced: 'This patient has appointment history and cannot be deleted',
    });
  }
};

module.exports = { findAll, findById, create, update, remove };
