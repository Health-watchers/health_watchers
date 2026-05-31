import { stellarPublicKey, mongoObjectId, icd10Code, monetaryAmount } from '../validators';
import { CreatePaymentIntentSchema, DexTradeSchema } from '../common-schemas';

describe('stellarPublicKey', () => {
  it('accepts valid Stellar public key', () => {
    expect(() => stellarPublicKey.parse('G' + 'A'.repeat(55))).not.toThrow();
  });
  it('rejects key not starting with G', () => {
    expect(() => stellarPublicKey.parse('S' + 'A'.repeat(55))).toThrow();
  });
  it('rejects key with wrong length', () => {
    expect(() => stellarPublicKey.parse('G' + 'A'.repeat(50))).toThrow();
  });
});

describe('mongoObjectId', () => {
  it('accepts valid 24-char hex ObjectId', () => {
    expect(() => mongoObjectId.parse('507f1f77bcf86cd799439011')).not.toThrow();
  });
  it('rejects 23-char string', () => {
    expect(() => mongoObjectId.parse('507f1f77bcf86cd79943901')).toThrow();
  });
  it('rejects uppercase hex', () => {
    expect(() => mongoObjectId.parse('507F1F77BCF86CD799439011')).toThrow();
  });
});

describe('icd10Code', () => {
  it('accepts Z00.00', () => expect(() => icd10Code.parse('Z00.00')).not.toThrow());
  it('accepts J45.901', () => expect(() => icd10Code.parse('J45.901')).not.toThrow());
  it('accepts bare 3-char code A00', () => expect(() => icd10Code.parse('A00')).not.toThrow());
  it('rejects free-form text', () => expect(() => icd10Code.parse('not a code')).toThrow());
});

describe('monetaryAmount', () => {
  it('accepts 100.00', () => expect(() => monetaryAmount.parse(100.00)).not.toThrow());
  it('accepts 0.01', () => expect(() => monetaryAmount.parse(0.01)).not.toThrow());
  it('rejects 0', () => expect(() => monetaryAmount.parse(0)).toThrow());
  it('rejects negative amount', () => expect(() => monetaryAmount.parse(-5)).toThrow());
  it('rejects amount > 10M', () => expect(() => monetaryAmount.parse(10_000_001)).toThrow());
});

describe('CreatePaymentIntentSchema — strict mode', () => {
  const valid = { patientId: '507f1f77bcf86cd799439011', amount: 150.00, currency: 'USDC' };
  it('accepts valid payment intent', () => {
    expect(() => CreatePaymentIntentSchema.parse(valid)).not.toThrow();
  });
  it('rejects unknown field (strict mode)', () => {
    expect(() => CreatePaymentIntentSchema.parse({ ...valid, hackerField: 'x' })).toThrow();
  });
  it('rejects invalid currency', () => {
    expect(() => CreatePaymentIntentSchema.parse({ ...valid, currency: 'ETH' })).toThrow();
  });
});

describe('DexTradeSchema', () => {
  const validTrade = { sellAsset: 'XLM', buyAsset: 'USDC', sellAmount: 100, expectedPrice: 0.12 };
  it('accepts valid trade', () => {
    expect(() => DexTradeSchema.parse(validTrade)).not.toThrow();
  });
  it('rejects same sellAsset and buyAsset', () => {
    expect(() => DexTradeSchema.parse({ ...validTrade, buyAsset: 'XLM' })).toThrow();
  });
  it('rejects unknown fields (strict mode)', () => {
    expect(() => DexTradeSchema.parse({ ...validTrade, extraField: true })).toThrow();
  });
});
