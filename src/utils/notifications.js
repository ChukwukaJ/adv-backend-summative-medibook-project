'use strict';

/** Pure builder for the confirmation messages the worker "sends" (written to the audit log). */
const buildConfirmationMessages = (appointment) => {
  const body =
    `Hello ${appointment.patientName}, your appointment ${appointment.reference} with ` +
    `${appointment.doctorName} (room ${appointment.room}) is confirmed for ${appointment.appointmentDatetime}.`;
  return [
    { channel: 'email', to: appointment.patientEmail, subject: 'MediBook appointment confirmation', body },
    { channel: 'sms', to: appointment.patientPhone, body },
  ];
};

module.exports = { buildConfirmationMessages };
