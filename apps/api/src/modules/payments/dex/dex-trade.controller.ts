import { Request, Response } from 'express';
import { validateTradeRequest } from './dex-trade.service';

/**
 * Feature flag for DEX trading.
 *
 * DEX trading is not fully implemented yet (see issue #1685). Until the
 * end-to-end flow (persisting a pending TradeRecord, submitting a
 * `manageSellOffer` through stellar-service, and reconciling fills via the
 * payment stream) is built, this flag is OFF by default.
 *
 * Set `DEX_TRADING_ENABLED=true` to enable the (incomplete) implementation.
 * When disabled, the DEX trade routes respond with `501 Not Implemented`.
 */
function isDexTradingEnabled(): boolean {
  return process.env.DEX_TRADING_ENABLED === 'true';
}

const NOT_IMPLEMENTED_MESSAGE =
  'DEX trading is not implemented yet. See issue #1685 for the full implementation.';

interface AuthenticatedUser {
  clinicId: string;
  [key: string]: unknown;
}

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export async function submitDexTrade(req: Request, res: Response) {
  if (!isDexTradingEnabled()) {
    return res.status(501).json({
      success: false,
      message: NOT_IMPLEMENTED_MESSAGE,
      issue: '#1685',
    });
  }

  const { clinicId } = (req as AuthenticatedRequest).user ?? ({} as AuthenticatedUser);
  const { sellAsset, buyAsset, sellAmount, expectedPrice, maxSlippagePercent = 1 } = req.body;

  const validation = validateTradeRequest({
    sellAsset,
    buyAsset,
    sellAmount,
    expectedPrice,
    maxSlippagePercent,
    clinicId,
  });
  if (!validation.valid) {
    return res.status(400).json({ success: false, message: validation.reason });
  }

  // TODO(#1685): persist a TradeRecord with status 'pending' and submit a
  // `manageSellOffer` through stellar-service, then reconcile fills via the
  // payment stream before reporting success.
  return res.status(501).json({
    success: false,
    message: NOT_IMPLEMENTED_MESSAGE,
    issue: '#1685',
  });
}

export async function getTradeHistory(req: Request, res: Response) {
  if (!isDexTradingEnabled()) {
    return res.status(501).json({
      success: false,
      message: NOT_IMPLEMENTED_MESSAGE,
      issue: '#1685',
    });
  }

  // TODO(#1685): await TradeRecordModel.find({ clinicId, tradeType: 'dex' }).sort({ createdAt: -1 })
  return res.json({ success: true, data: [] });
}