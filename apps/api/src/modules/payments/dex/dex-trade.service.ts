export interface TradeRequest {
  sellAsset: string;
  buyAsset: string;
  sellAmount: number;
  expectedPrice: number;
  maxSlippagePercent: number;
  clinicId: string;
}

export interface TradeValidation {
  valid: boolean;
  reason?: string;
  minAcceptablePrice?: number;
}

export function validateTradeRequest(req: TradeRequest): TradeValidation {
  if (req.sellAmount <= 0) return { valid: false, reason: 'sellAmount must be greater than 0' };
  if (req.expectedPrice <= 0) return { valid: false, reason: 'expectedPrice must be greater than 0' };
  if (req.maxSlippagePercent < 0 || req.maxSlippagePercent > 50)
    return { valid: false, reason: 'maxSlippagePercent must be between 0 and 50' };
  if (req.sellAsset === req.buyAsset)
    return { valid: false, reason: 'sellAsset and buyAsset must differ' };

  const minAcceptablePrice = req.expectedPrice * (1 - req.maxSlippagePercent / 100);
  return { valid: true, minAcceptablePrice };
}

export function isWithinSlippage(
  currentMarketPrice: number,
  expectedPrice: number,
  maxSlippagePercent: number,
): boolean {
  const floor = expectedPrice * (1 - maxSlippagePercent / 100);
  return currentMarketPrice >= floor;
}

export interface TradeRecord {
  clinicId: string;
  sellAsset: string;
  buyAsset: string;
  sellAmount: number;
  expectedPrice: number;
  executedPrice?: number;
  maxSlippagePercent: number;
  status: 'pending' | 'executed' | 'cancelled' | 'slippage_rejected';
  stellarOfferId?: string;
  tradeType: 'dex';
  createdAt: Date;
}
