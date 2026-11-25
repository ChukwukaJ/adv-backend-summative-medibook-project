'use strict';

const { calculateRefund } = require('../src/utils/refund');
const { MS_PER_HOUR } = require('../src/config/constants');

// Fixed dates: no dependency on the real clock.
const appointmentDate = new Date(2026, 11, 10, 10, 0, 0);
const cancelledBefore = (hours) => new Date(appointmentDate.getTime() - hours * MS_PER_HOUR);
const refundFor = (hours, amountPaid = 150) =>
  calculateRefund({ amountPaid, appointmentDate, cancelledAt: cancelledBefore(hours) });

describe('calculateRefund - policy: >48h 100%, 24h..48h inclusive 50%, <24h 0%', () => {
  test('more than 48 hours notice refunds 100%', () => {
    expect(refundFor(72)).toMatchObject({ refundPercent: 100, refundAmount: 150 });
  });

  test('between 24 and 48 hours notice refunds 50%', () => {
    expect(refundFor(36)).toMatchObject({ refundPercent: 50, refundAmount: 75 });
  });

  test('less than 24 hours notice refunds nothing', () => {
    expect(refundFor(5)).toMatchObject({ refundPercent: 0, refundAmount: 0 });
  });

  test('exactly 48 hours falls in the 50% tier (100% needs MORE than 48h)', () => {
    expect(refundFor(48)).toMatchObject({ refundPercent: 50, refundAmount: 75 });
  });

  test('one millisecond over 48 hours earns the full refund', () => {
    const cancelledAt = new Date(cancelledBefore(48).getTime() - 1);
    expect(calculateRefund({ amountPaid: 150, appointmentDate, cancelledAt }).refundPercent).toBe(100);
  });

  test('exactly 24 hours still earns 50% (0% needs LESS than 24h)', () => {
    expect(refundFor(24)).toMatchObject({ refundPercent: 50, refundAmount: 75 });
  });

  test('one millisecond under 24 hours earns nothing', () => {
    const cancelledAt = new Date(cancelledBefore(24).getTime() + 1);
    expect(calculateRefund({ amountPaid: 150, appointmentDate, cancelledAt }).refundPercent).toBe(0);
  });

  test('rounds to whole cents using integer arithmetic', () => {
    expect(refundFor(30, 99.99).refundAmount).toBe(50);
    expect(refundFor(30, 0.01).refundAmount).toBe(0.01);
  });

  test('a discounted amount is refunded proportionally, not by the list fee', () => {
    expect(refundFor(36, 120).refundAmount).toBe(60);
  });

  test('cancelling after the start time never refunds', () => {
    expect(refundFor(-1)).toMatchObject({ refundPercent: 0, refundAmount: 0 });
  });
});
