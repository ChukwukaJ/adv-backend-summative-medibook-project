'use strict';

const { validatePatientInput, validateDoctorInput, validateBookingInput, parseIdParam } = require('../src/utils/validators');

describe('validatePatientInput', () => {
  test('accepts valid input and normalises the email', () => {
    const result = validatePatientInput({ fullName: ' Ama Mensah ', email: 'Ama@Mail.COM', phone: '0244-111-222' });
    expect(result.valid).toBe(true);
    expect(result.value).toEqual({ fullName: 'Ama Mensah', email: 'ama@mail.com', phone: '0244-111-222' });
  });

  test('reports every problem at once', () => {
    const result = validatePatientInput({ fullName: '', email: 'not-an-email', phone: 'abc' });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(3);
  });

  test('rejects a non-object body', () => {
    expect(validatePatientInput(null).valid).toBe(false);
    expect(validatePatientInput([]).valid).toBe(false);
  });
});

describe('validateDoctorInput', () => {
  const base = { fullName: 'Dr. Boateng', specialty: 'Dermatology', room: 'R-12' };

  test('accepts a valid doctor', () => {
    expect(validateDoctorInput({ ...base, consultationFee: 150 }).valid).toBe(true);
  });

  test('rejects negative, non-numeric and over-precise fees', () => {
    [-1, '150', 10.999, NaN].forEach((consultationFee) => {
      expect(validateDoctorInput({ ...base, consultationFee }).valid).toBe(false);
    });
  });
});

describe('validateBookingInput', () => {
  test('requires positive integer ids and a datetime', () => {
    expect(validateBookingInput({ patientId: 1, doctorId: 2, datetime: '2026-12-01 09:00' }).valid).toBe(true);
    expect(validateBookingInput({ patientId: '1', doctorId: 0 }).errors).toHaveLength(3);
  });
});

describe('parseIdParam', () => {
  test('returns a number for valid ids', () => {
    expect(parseIdParam('42')).toBe(42);
  });

  test('throws a 400 for junk, zero, negatives and SQL-looking input', () => {
    ['abc', '0', '-1', '1.5', '1 OR 1=1', ''].forEach((raw) => {
      expect(() => parseIdParam(raw)).toThrow(expect.objectContaining({ status: 400 }));
    });
  });
});
