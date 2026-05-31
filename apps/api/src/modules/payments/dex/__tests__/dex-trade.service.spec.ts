import { validateTradeRequest, isWithinSlippage } from '../dex-trade.service';

const base = { sellAsset: 'XLM', buyAsset: 'USDC', sellAmount: 100, expectedPrice: 0.12, maxSlippagePercent: 1, clinicId: 'cli_001' };

describe('validateTradeRequest', () => {
  it('accepts a valid trade request', () => {
    const result = validateTradeRequest(base);
    expect(result.valid).toBe(true);
    expect(result.minAcceptablePrice).toBeCloseTo(0.12 * 0.99, 6);
  });
  it('rejects zero sellAmount', () => {
    expect(validateTradeRequest({ ...base, sellAmount: 0 }).valid).toBe(false);
  });
  it('rejects negative sellAmount', () => {
    expect(validateTradeRequest({ ...base, sellAmount: -10 }).valid).toBe(false);
  });
  it('rejects zero expectedPrice', () => {
    expect(validateTradeRequest({ ...base, expectedPrice: 0 }).valid).toBe(false);
  });
  it('rejects slippage > 50%', () => {
    const result = validateTradeRequest({ ...base, maxSlippagePercent: 51 });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('maxSlippagePercent');
  });
  it('rejects same sellAsset and buyAsset', () => {
    const result = validateTradeRequest({ ...base, sellAsset: 'XLM', buyAsset: 'XLM' });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('must differ');
  });
  it('calculates slippage floor correctly for 2%', () => {
    const result = validateTradeRequest({ ...base, maxSlippagePercent: 2, expectedPrice: 1.0 });
    expect(result.minAcceptablePrice).toBeCloseTo(0.98, 6);
  });
});

describe('isWithinSlippage', () => {
  it('returns true when market price is at expected price', () => {
    expect(isWithinSlippage(0.12, 0.12, 1)).toBe(true);
  });
  it('returns true when market price is above floor', () => {
    expect(isWithinSlippage(0.119, 0.12, 1)).toBe(true);
  });
  it('returns false when market price drops below slippage floor', () => {
    expect(isWithinSlippage(0.115, 0.12, 1)).toBe(false);
  });
  it('returns false when market is just under floor', () => {
    expect(isWithinSlippage(0.118, 0.12, 1)).toBe(false);
  });
});
