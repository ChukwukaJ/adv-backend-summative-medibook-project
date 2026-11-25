'use strict';

// Clinic-local wall-clock helpers. Datetimes are exchanged as "YYYY-MM-DD HH:MM[:SS]" (or with a "T").

const DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (value) => String(value).padStart(2, '0');

const buildStrictDate = (year, month, day, hour, minute, second) => {
  const date = new Date(year, month - 1, day, hour, minute, second);
  const isRealDate =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute &&
    date.getSeconds() === second;
  return isRealDate ? date : null;
};

const parseClinicDateTime = (value) => {
  if (typeof value !== 'string') return null;
  const match = DATETIME_PATTERN.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return buildStrictDate(+year, +month, +day, +hour, +minute, second === undefined ? 0 : +second);
};

const parseClinicDate = (value) => {
  if (typeof value !== 'string') return null;
  const match = DATE_PATTERN.exec(value.trim());
  if (!match) return null;
  return buildStrictDate(+match[1], +match[2], +match[3], 0, 0, 0);
};

const formatClinicDate = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const formatClinicDateTime = (date) =>
  `${formatClinicDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);

const startOfNextDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0);

module.exports = {
  parseClinicDateTime,
  parseClinicDate,
  formatClinicDate,
  formatClinicDateTime,
  startOfDay,
  startOfNextDay,
};
