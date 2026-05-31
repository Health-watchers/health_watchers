import { Request, Response } from 'express';
import { validateTradeRequest } from './dex-trade.service';

export async function submitDexTrade(req: Request, res: Response) {
  const { clinicId } = req.user as any;
  const { sellAsset, buyAsset, sellAmount, expectedPrice, maxSlippagePercent = 1 } = req.body;

  const validation = validateTradeRequest({ sellAsset, buyAsset, sellAmount, expectedPrice, maxSlippagePercent, clinicId });
  if (!validation.valid) {
    return res.status(400).json({ success: false, message: validation.reason });
  }

  // TODO: wire to stellarService.createOffer() and TradeRecordModel.create()
  return res.status(202).json({
    success: true,
    message: 'Trade submitted',
    data: { sellAsset, buyAsset, sellAmount, expectedPrice, minAcceptablePrice: validation.minAcceptablePrice, maxSlippagePercent },
  });
}

export async function getTradeHistory(req: Request, res: Response) {
  // TODO: await TradeRecordModel.find({ clinicId, tradeType: 'dex' }).sort({ createdAt: -1 })
  return res.json({ success: true, data: [] });
}
