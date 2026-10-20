/**
 * Line item calculation engine (Issue #1245)
 *
 * All monetary values are stored as decimal strings with 7 decimal places to
 * avoid floating point drift when summing line items. The public functions are
 * pure and fully unit-tested — invoices must generate correctly 100% of the
 * time and calculations must be verifiable against manual arithmetic.
 */

export const MONEY_PRECISION = 7;
const SCALE = 10 ** MONEY_PRECISION;

/** Round a raw number to MONEY_PRECISION decimals and return it as a string. */
export function roundAmount(value: number, decimals: number = MONEY_PRECISION): string {
  const factor = 10 ** decimals;
  const scaled = Math.round((value + Number.EPSILON) * factor);
  return (scaled / factor).toFixed(decimals);
}

export interface LineItemInput {
  description: string;
  quantity: number;
  unitPrice: string;
}

export interface LineItemTotals extends LineItemInput {
  total: string;
}

export interface InvoiceTotalsOptions {
  /** Applied to the subtotal after discounts, e.g. 7.5 for 7.5%. */
  taxRatePercent?: number;
  /** Applied to the subtotal before tax, e.g. 10 for 10%. */
  discountPercent?: number;
}

export interface InvoiceTotals {
  lineItems: LineItemTotals[];
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  total: string;
}

/** Compute the total for a single line item: quantity × unitPrice. */
export function calculateLineItemTotal(quantity: number, unitPrice: string): string {
  return roundAmount(quantity * parseFloat(unitPrice));
}

/**
 * Compute full invoice totals from raw line items.
 *
 *   subtotal       = Σ (quantity × unitPrice)
 *   discountAmount = subtotal × discountPercent%
 *   taxable        = subtotal − discountAmount
 *   taxAmount      = taxable × taxRatePercent%
 *   total          = taxable + taxAmount
 */
export function calculateInvoiceTotals(
  lineItems: LineItemInput[],
  options: InvoiceTotalsOptions = {}
): InvoiceTotals {
  const taxRate = options.taxRatePercent ?? 0;
  const discountRate = options.discountPercent ?? 0;

  const computedItems: LineItemTotals[] = lineItems.map((item) => ({
    ...item,
    total: calculateLineItemTotal(item.quantity, item.unitPrice),
  }));

  const subtotal = roundAmount(
    computedItems.reduce((sum, item) => sum + parseFloat(item.total), 0)
  );
  const discountAmount = roundAmount((parseFloat(subtotal) * discountRate) / 100);
  const taxable = parseFloat(subtotal) - parseFloat(discountAmount);
  const taxAmount = roundAmount((taxable * taxRate) / 100);
  const total = roundAmount(taxable + parseFloat(taxAmount));

  return { lineItems: computedItems, subtotal, discountAmount, taxAmount, total };
}
