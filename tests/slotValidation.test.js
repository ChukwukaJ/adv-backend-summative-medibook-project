'use strict';

const { validateBookingSlot } = require('../src/utils/slotValidation');

const now = new Date(2026, 10, 24, 12, 0, 0);

describe('validateBookingSlot', () => {
  test('accepts a future slot on a boundary inside working hours', () => {
    const result = validateBookingSlot('2026-12-01 09:00', now);
    expect(result.valid).toBe(true);
    expect(result.date.getHours()).toBe(9);
  });

  test('accepts the first slot (09:00) and the last slot (16:30)', () => {
    expect(validateBookingSlot('2026-12-01 09:00', now).valid).toBe(true);
    expect(validateBookingSlot('2026-12-01 16:30', now).valid).toBe(true);
  });

  test('rejects 17:00 exactly because the slot would end after closing time', () => {
    expect(validateBookingSlot('2026-12-01 17:00', now)).toMatchObject({
      valid: false,
      code: 'OUTSIDE_WORKING_HOURS',
      httpStatus: 422,
    });
  });

  test('rejects 08:30, before opening', () => {
    expect(validateBookingSlot('2026-12-01 08:30', now).code).toBe('OUTSIDE_WORKING_HOURS');
  });

  test('rejects 09:15, off the 30-minute boundary', () => {
    expect(validateBookingSlot('2026-12-01 09:15', now)).toMatchObject({
      valid: false,
      code: 'SLOT_NOT_ON_BOUNDARY',
      httpStatus: 422,
    });
  });

  test('rejects a slot with non-zero seconds', () => {
    expect(validateBookingSlot('2026-12-01 09:30:20', now).code).toBe('SLOT_NOT_ON_BOUNDARY');
  });

  test('rejects malformed and impossible dates with a 400', () => {
    ['tomorrow at nine', '2026-12-01', '2026-02-30 09:00', '2026-13-01 09:00', '', null, 42].forEach((input) => {
      expect(validateBookingSlot(input, now)).toMatchObject({ valid: false, code: 'MALFORMED_DATETIME', httpStatus: 400 });
    });
  });

  test('rejects past slots and a slot equal to the current instant', () => {
    expect(validateBookingSlot('2026-11-20 09:00', now)).toMatchObject({ valid: false, code: 'SLOT_NOT_IN_FUTURE' });
    const sameInstant = new Date(2026, 10, 24, 12, 0, 0);
    expect(validateBookingSlot('2026-11-24 12:00', sameInstant).code).toBe('SLOT_NOT_IN_FUTURE');
  });
});
