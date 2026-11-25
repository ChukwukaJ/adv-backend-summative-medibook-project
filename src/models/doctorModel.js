'use strict';

const pool = require('../config/db');
const { translateConstraintError } = require('./dbErrors');

const SELECT_DOCTOR = `
  SELECT id, full_name AS fullName, specialty, consultation_fee AS consultationFee,
         room, created_at AS createdAt
  FROM doctors`;

const findAll = async () => {
  const [rows] = await pool.execute(`${SELECT_DOCTOR} ORDER BY id`);
  return rows;
};

const findById = async (id) => {
  const [rows] = await pool.execute(`${SELECT_DOCTOR} WHERE id = ?`, [id]);
  return rows[0] || null;
};

const create = async ({ fullName, specialty, consultationFee, room }) => {
  const [result] = await pool.execute(
    'INSERT INTO doctors (full_name, specialty, consultation_fee, room) VALUES (?, ?, ?, ?)',
    [fullName, specialty, consultationFee, room]
  );
  return result.insertId;
};

const update = async (id, { fullName, specialty, consultationFee, room }) => {
  await pool.execute(
    'UPDATE doctors SET full_name = ?, specialty = ?, consultation_fee = ?, room = ? WHERE id = ?',
    [fullName, specialty, consultationFee, room, id]
  );
};

const remove = async (id) => {
  try {
    const [result] = await pool.execute('DELETE FROM doctors WHERE id = ?', [id]);
    return result.affectedRows > 0;
  } catch (error) {
    throw translateConstraintError(error, {
      referenced: 'This doctor has appointment history and cannot be deleted',
    });
  }
};

module.exports = { findAll, findById, create, update, remove };
