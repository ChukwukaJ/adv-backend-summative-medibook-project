'use strict';

const { parseClinicDateTime, parseClinicDate, formatClinicDateTime } = require('../src/utils/dateTime');

describe('clinic date helpers', () => {
  test('parses both space and T separated datetimes, with optional seconds', () => {
    expect(parseClinicDateTime('2026-12-01 09:30')).toEqual(new Date(2026, 11, 1, 9, 30, 0));
    expect(parseClinicDateTime('2026-12-01T09:30:15')).toEqual(new Date(2026, 11, 1, 9, 30, 15));
  });

  test('rejects impossible calendar values instead of rolling them over', () => {
    expect(parseClinicDateTime('2026-02-30 09:00')).toBeNull();
    expect(parseClinicDateTime('2026-12-01 25:00')).toBeNull();
    expect(parseClinicDate('2026-04-31')).toBeNull();
  });

  test('formats back to the database wall-clock format', () => {
    expect(formatClinicDateTime(new Date(2026, 0, 5, 9, 0, 0))).toBe('2026-01-05 09:00:00');
  });
});
