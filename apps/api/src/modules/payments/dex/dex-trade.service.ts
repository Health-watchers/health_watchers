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
  if (req.expectedPrice <= 0)
    return { valid: false, reason: 'expectedPrice must be greater than 0' };
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
  maxSlippagePercent: number
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

/**
 * DEX trading is not implemented yet (see #1685). The feature flag is off by
 * default; set `DEX_TRADING_ENABLED=true` to expose the trade endpoints.
 */
export function isDexTradingEnabled(): boolean {
  return process.env.DEX_TRADING_ENABLED === 'true';
}

export interface TradeRecordDocument extends TradeRecord {
  _id?: unknown;
}

export interface TradeRecordModelLike {
  create(doc: TradeRecord): Promise<TradeRecordDocument>;
  find(filter: { clinicId: string }): {
    sort(order: { createdAt: -1 }): { limit(n: number): Promise<TradeRecordDocument[]> };
  };
}

export interface StellarOfferClient {
  createOffer(params: {
    clinicId: string;
    sellAsset: string;
    buyAsset: string;
    sellAmount: number;
    minAcceptablePrice: number;
  }): Promise<{ offerId: string }>;
}

export interface TradeRecordDeps {
  tradeRecordModel: TradeRecordModelLike;
  stellarService: StellarOfferClient;
}

export async function createPendingTradeRecord(
  deps: Pick<TradeRecordDeps, 'tradeRecordModel'>,
  req: TradeRequest
): Promise<TradeRecordDocument> {
  return deps.tradeRecordModel.create({
    clinicId: req.clinicId,
    sellAsset: req.sellAsset,
    buyAsset: req.buyAsset,
    sellAmount: req.sellAmount,
    expectedPrice: req.expectedPrice,
    maxSlippagePercent: req.maxSlippagePercent,
    status: 'pending',
    tradeType: 'dex',
    createdAt: new Date(),
  });
}

export async function submitManageSellOffer(
  deps: Pick<TradeRecordDeps, 'stellarService'>,
  req: TradeRequest,
  minAcceptablePrice: number
): Promise<{ offerId: string }> {
  return deps.stellarService.createOffer({
    clinicId: req.clinicId,
    sellAsset: req.sellAsset,
    buyAsset: req.buyAsset,
    sellAmount: req.sellAmount,
    minAcceptablePrice,
  });
}

export async function findTradeHistory(
  deps: Pick<TradeRecordDeps, 'tradeRecordModel'>,
  clinicId: string,
  limit = 50
): Promise<TradeRecordDocument[]> {
  return deps.tradeRecordModel
    .find({ clinicId })
    .sort({ createdAt: -1 })
    .limit(limit);
}
