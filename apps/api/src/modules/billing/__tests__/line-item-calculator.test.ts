import {
  calculateLineItemTotal,
  calculateInvoiceTotals,
  roundAmount,
} from '../line-item-calculator';

describe('roundAmount', () => {
  it('rounds to 7 decimal places by default', () => {
    expect(roundAmount(0.1 + 0.2)).toBe('0.3000000');
    expect(roundAmount(1.5)).toBe('1.5000000');
  });

  it('rounds halves up', () => {
    expect(roundAmount(1.005, 2)).toBe('1.01');
  });

  it('supports custom precision', () => {
    expect(roundAmount(3.14159, 2)).toBe('3.14');
  });
});

describe('calculateLineItemTotal', () => {
  it('computes quantity × unitPrice', () => {
    expect(calculateLineItemTotal(3, '0.5000000')).toBe('1.5000000');
  });

  it('handles integer quantities', () => {
    expect(calculateLineItemTotal(2, '75.00')).toBe('150.0000000');
  });

  it('handles fractional unit prices', () => {
    expect(calculateLineItemTotal(1, '0.0000012')).toBe('0.0000012');
  });
});

describe('calculateInvoiceTotals', () => {
  it('computes subtotal from line items', () => {
    const result = calculateInvoiceTotals([
      { description: 'Office visit', quantity: 1, unitPrice: '110.00' },
      { description: 'ECG', quantity: 1, unitPrice: '85.00' },
      { description: 'Blood draw', quantity: 2, unitPrice: '25.00' },
    ]);

    expect(result.lineItems.map((i) => i.total)).toEqual([
      '110.0000000',
      '85.0000000',
      '50.0000000',
    ]);
    expect(result.subtotal).toBe('245.0000000');
    expect(result.discountAmount).toBe('0.0000000');
    expect(result.taxAmount).toBe('0.0000000');
    expect(result.total).toBe('245.0000000');
  });

  it('applies percentage discount before tax', () => {
    const result = calculateInvoiceTotals(
      [{ description: 'Procedure', quantity: 1, unitPrice: '200.00' }],
      { discountPercent: 10, taxRatePercent: 7.5 }
    );

    // subtotal 200, discount 20, taxable 180, tax 13.5, total 193.5
    expect(result.subtotal).toBe('200.0000000');
    expect(result.discountAmount).toBe('20.0000000');
    expect(result.taxAmount).toBe('13.5000000');
    expect(result.total).toBe('193.5000000');
  });

  it('applies tax without discount', () => {
    const result = calculateInvoiceTotals(
      [{ description: 'Lab', quantity: 1, unitPrice: '65.00' }],
      { taxRatePercent: 5 }
    );

    expect(result.taxAmount).toBe('3.2500000');
    expect(result.total).toBe('68.2500000');
  });

  it('returns zeroed totals for empty line items', () => {
    const result = calculateInvoiceTotals([]);
    expect(result.subtotal).toBe('0.0000000');
    expect(result.total).toBe('0.0000000');
    expect(result.lineItems).toEqual([]);
  });

  it('matches manual arithmetic exactly', () => {
    // Manual check: 3 × 0.25 = 0.75, 2 × 1.10 = 2.20 → subtotal 2.95
    const result = calculateInvoiceTotals([
      { description: 'A', quantity: 3, unitPrice: '0.25' },
      { description: 'B', quantity: 2, unitPrice: '1.10' },
    ]);

    expect(result.subtotal).toBe('2.9500000');
    expect(result.total).toBe('2.9500000');
  });

  it('accumulates many line items without floating point drift', () => {
    const items = Array.from({ length: 100 }, () => ({
      description: 'item',
      quantity: 1,
      unitPrice: '0.10',
    }));
    const result = calculateInvoiceTotals(items);
    expect(result.total).toBe('10.0000000');
  });
});
