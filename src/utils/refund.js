'use strict';

const { REFUND_TIERS, DEFAULT_REFUND_PERCENT, MS_PER_HOUR } = require('../config/constants');

const toCents = (amount) => Math.round(Number(amount) * 100);

/** Percent refunded for a given notice period, compared in milliseconds to avoid float drift. */
const getRefundPercent = (noticeMs) => {
  const tier = REFUND_TIERS.find(({ minHours, inclusive }) => {
    const threshold = minHours * MS_PER_HOUR;
    return inclusive ? noticeMs >= threshold : noticeMs > threshold;
  });
  return tier ? tier.percent : DEFAULT_REFUND_PERCENT;
};

/**
 * Computes the refund for cancelling at `cancelledAt` an appointment at `appointmentDate`.
 * Money is handled in integer cents and rounded once at the end.
 */
const calculateRefund = ({ amountPaid, appointmentDate, cancelledAt }) => {
  const noticeMs = appointmentDate.getTime() - cancelledAt.getTime();
  const refundPercent = getRefundPercent(noticeMs);
  const refundCents = Math.round((toCents(amountPaid) * refundPercent) / 100);
  return {
    noticeHours: noticeMs / MS_PER_HOUR,
    refundPercent,
    refundAmount: refundCents / 100,
  };
};

module.exports = { calculateRefund, getRefundPercent };
