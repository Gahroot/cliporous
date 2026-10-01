import { describe, expect, it } from 'vitest';
import { cashTimingPose } from './poses';

const beats = { setupAt: 0.3, actionAt: 2, responseAt: 4, checkAt: 6, resolveAt: 8 };
describe('cash lane reveal', () => {
  it('never treats the later invoice as an earlier cash receipt', () => {
    expect(cashTimingPose(3, beats)).toEqual({ costPaid: 1, laterInvoice: 0, comparison: 0 });
    expect(cashTimingPose(9, beats)).toEqual(cashTimingPose(8.5, beats));
    expect(cashTimingPose(0, beats)).toEqual({ costPaid: 0, laterInvoice: 0, comparison: 0 });
  });
});
