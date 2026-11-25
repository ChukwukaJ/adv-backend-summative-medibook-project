'use strict';

const { buildConfirmationMessages } = require('../src/utils/notifications');

describe('buildConfirmationMessages', () => {
  const appointment = {
    reference: 'AP-044',
    patientName: 'Efua Quaye',
    patientEmail: 'efua@mail.com',
    patientPhone: '0200-555-666',
    doctorName: 'Dr. Adjei',
    room: 'R-03',
    appointmentDatetime: '2026-11-25 10:00:00',
  };

  test('produces one email and one SMS addressed to the right contact details', () => {
    const [email, sms] = buildConfirmationMessages(appointment);
    expect(email).toMatchObject({ channel: 'email', to: 'efua@mail.com' });
    expect(sms).toMatchObject({ channel: 'sms', to: '0200-555-666' });
  });

  test('mentions the reference, doctor, room and time', () => {
    const [{ body }] = buildConfirmationMessages(appointment);
    ['AP-044', 'Dr. Adjei', 'R-03', '2026-11-25 10:00:00'].forEach((part) => expect(body).toContain(part));
  });
});
