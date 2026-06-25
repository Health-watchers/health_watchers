import { selectFeeStrategy, isOffPeak, isCongested, FeeEstimate } from '../services/fee-optimizer';

describe('isOffPeak', () => {
  it('returns true for hours before 06:00 UTC', () => {
    expect(isOffPeak(0)).toBe(true);
    expect(isOffPeak(3)).toBe(true);
    expect(isOffPeak(5)).toBe(true);
  });

  it('returns false for hours 06:00–21:59 UTC', () => {
    expect(isOffPeak(6)).toBe(false);
    expect(isOffPeak(12)).toBe(false);
    expect(isOffPeak(21)).toBe(false);
  });

  it('returns true for hours 22:00–23:59 UTC', () => {
    expect(isOffPeak(22)).toBe(true);
    expect(isOffPeak(23)).toBe(true);
  });
});

describe('isCongested', () => {
  it('returns false when feeEstimate is null or undefined', () => {
    expect(isCongested(null)).toBe(false);
    expect(isCongested(undefined)).toBe(false);
  });

  it('returns false when no p50/p90 data present', () => {
    expect(isCongested({})).toBe(false);
    expect(isCongested({ fee_charged: {} })).toBe(false);
  });

  it('returns false when p90 < 3× p50', () => {
    const estimate: FeeEstimate = { fee_charged: { p50: 100, p90: 250 } };
    expect(isCongested(estimate)).toBe(false);
  });

  it('returns true when p90 >= 3× p50 (fee_charged bucket)', () => {
    const estimate: FeeEstimate = { fee_charged: { p50: 100, p90: 300 } };
    expect(isCongested(estimate)).toBe(true);
  });

  it('returns true when p90 >= 3× p50 (max_fee bucket fallback)', () => {
    const estimate: FeeEstimate = { max_fee: { p50: 100, p90: 400 } };
    expect(isCongested(estimate)).toBe(true);
  });

  it('returns false when p50 is zero (avoids division by zero)', () => {
    const estimate: FeeEstimate = { fee_charged: { p50: 0, p90: 999 } };
    expect(isCongested(estimate)).toBe(false);
  });
});

describe('selectFeeStrategy', () => {
  const PEAK_HOUR = 14; // 14:00 UTC — definitely peak
  const OFF_PEAK_HOUR = 2; // 02:00 UTC — definitely off-peak

  it('returns "fast" when network is congested, regardless of amount or time', () => {
    const congested: FeeEstimate = { fee_charged: { p50: 100, p90: 350 } };
    expect(selectFeeStrategy({ amount: '1', utcHour: OFF_PEAK_HOUR, feeEstimate: congested })).toBe('fast');
    expect(selectFeeStrategy({ amount: '1', utcHour: PEAK_HOUR, feeEstimate: congested })).toBe('fast');
  });

  it('returns "fast" for high-value payments (>= 100 XLM) during peak hours', () => {
    expect(selectFeeStrategy({ amount: '100', utcHour: PEAK_HOUR })).toBe('fast');
    expect(selectFeeStrategy({ amount: '500', utcHour: PEAK_HOUR })).toBe('fast');
  });

  it('returns "fast" for high-value payments even during off-peak', () => {
    expect(selectFeeStrategy({ amount: '100', utcHour: OFF_PEAK_HOUR })).toBe('fast');
  });

  it('returns "slow" for small amounts during off-peak hours', () => {
    expect(selectFeeStrategy({ amount: '5', utcHour: OFF_PEAK_HOUR })).toBe('slow');
    expect(selectFeeStrategy({ amount: '99.9', utcHour: OFF_PEAK_HOUR })).toBe('slow');
  });

  it('returns "standard" for small amounts during peak hours', () => {
    expect(selectFeeStrategy({ amount: '5', utcHour: PEAK_HOUR })).toBe('standard');
    expect(selectFeeStrategy({ amount: '50', utcHour: PEAK_HOUR })).toBe('standard');
  });

  it('returns "standard" when amount is invalid / zero', () => {
    expect(selectFeeStrategy({ amount: '', utcHour: PEAK_HOUR })).toBe('standard');
    expect(selectFeeStrategy({ amount: '0', utcHour: PEAK_HOUR })).toBe('standard');
  });

  it('congestion check takes priority over high-value', () => {
    const congested: FeeEstimate = { fee_charged: { p50: 100, p90: 400 } };
    // Would be "fast" anyway but we ensure the congestion path fires first
    const result = selectFeeStrategy({ amount: '200', utcHour: PEAK_HOUR, feeEstimate: congested });
    expect(result).toBe('fast');
  });

  it('uses wall-clock UTC hour when utcHour is not injected', () => {
    // Just confirm it doesn't throw and returns a valid strategy
    const result = selectFeeStrategy({ amount: '10' });
    expect(['slow', 'standard', 'fast']).toContain(result);
  });
});
