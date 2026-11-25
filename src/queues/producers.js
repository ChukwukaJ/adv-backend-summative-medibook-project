'use strict';

const { Queue } = require('bullmq');
const { QUEUE_NAMES } = require('../config/constants');
const { createRedisConnection } = require('./connection');

const JOB_OPTIONS = Object.freeze({
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: 1000,
  removeOnFail: false,
});

const queues = new Map();

const getQueue = (name) => {
  if (!queues.has(name)) {
    // Producers fail fast (instead of hanging) when Redis is unreachable.
    const connection = createRedisConnection({ maxRetriesPerRequest: 2 });
    queues.set(name, new Queue(name, { connection, defaultJobOptions: JOB_OPTIONS }));
  }
  return queues.get(name);
};

const enqueueConfirmation = (appointment) =>
  getQueue(QUEUE_NAMES.NOTIFICATION).add('appointment-confirmation', {
    appointmentId: appointment.id,
    reference: appointment.reference,
    patientName: appointment.patientName,
    patientEmail: appointment.patientEmail,
    patientPhone: appointment.patientPhone,
    doctorName: appointment.doctorName,
    room: appointment.room,
    appointmentDatetime: appointment.appointmentDatetime,
  });

const enqueuePromotion = ({ doctorId, freedSlot, cancelledAppointmentId }) =>
  getQueue(QUEUE_NAMES.PROMOTION).add(
    'promote-waitlist',
    { doctorId, freedSlot, cancelledAppointmentId },
    { jobId: `promote-${cancelledAppointmentId}` }
  );

const closeQueues = async () => {
  await Promise.all([...queues.values()].map((queue) => queue.close()));
  queues.clear();
};

module.exports = { enqueueConfirmation, enqueuePromotion, closeQueues };
