import { Request, Response } from 'express';
import { PaymentRecordModel } from './models/payment-record.model';
import { v4 as uuidv4 } from 'uuid';

export async function createClaimableBalance(req: Request, res: Response): Promise<void> {
  const { clinicId } = req.user!;
  const { amount, claimantPublicKey, claimableAfter, claimableUntil, encounterId, patientId } = req.body;

  if (!amount || !claimantPublicKey || !claimableAfter || !claimableUntil) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields: amount, claimantPublicKey, claimableAfter, claimableUntil',
    });
    return;
  }

  const claimableAfterDate = new Date(claimableAfter);
  const claimableUntilDate = new Date(claimableUntil);

  if (claimableAfterDate >= claimableUntilDate) {
    res.status(400).json({
      success: false,
      error: 'claimableAfter must be before claimableUntil',
    });
    return;
  }

  // In a real implementation, this would call the Stellar service to create the claimable balance
  // For now, we'll simulate it
  const claimableBalanceId = `cb_${uuidv4().replace(/-/g, '')}`;
  const intentId = `escrow_${uuidv4()}`;

  const paymentRecord = await PaymentRecordModel.create({
    intentId,
    amount,
    destination: claimantPublicKey,
    status: 'pending',
    clinicId,
    patientId,
    assetCode: 'XLM',
    claimableBalanceId,
    claimableAfter: claimableAfterDate,
    claimableUntil: claimableUntilDate,
    claimed: false,
    encounterId,
  });

  res.status(201).json({
    success: true,
    data: {
      intentId: paymentRecord.intentId,
      claimableBalanceId: paymentRecord.claimableBalanceId,
      amount: paymentRecord.amount,
      claimableAfter: paymentRecord.claimableAfter,
      claimableUntil: paymentRecord.claimableUntil,
      status: 'pending',
    },
  });
}

export async function claimBalance(req: Request, res: Response): Promise<void> {
  const { balanceId } = req.params;
  const { clinicId } = req.user!;

  const paymentRecord = await PaymentRecordModel.findOne({
    claimableBalanceId: balanceId,
    clinicId,
  });

  if (!paymentRecord) {
    res.status(404).json({
      success: false,
      error: 'Claimable balance not found',
    });
    return;
  }

  if (paymentRecord.claimed) {
    res.status(400).json({
      success: false,
      error: 'Balance already claimed',
    });
    return;
  }

  const now = new Date();

  if (paymentRecord.claimableAfter && now < paymentRecord.claimableAfter) {
    res.status(400).json({
      success: false,
      error: 'Balance not yet claimable',
      claimableAfter: paymentRecord.claimableAfter,
    });
    return;
  }

  if (paymentRecord.claimableUntil && now > paymentRecord.claimableUntil) {
    res.status(400).json({
      success: false,
      error: 'Balance claim period expired',
    });
    return;
  }

  // In a real implementation, this would call the Stellar service to claim the balance
  // For now, we'll simulate it
  paymentRecord.claimed = true;
  paymentRecord.claimedAt = now;
  paymentRecord.status = 'confirmed';
  paymentRecord.confirmedAt = now;
  paymentRecord.txHash = `claim_${uuidv4().replace(/-/g, '')}`;
  await paymentRecord.save();

  res.json({
    success: true,
    data: {
      claimableBalanceId: paymentRecord.claimableBalanceId,
      claimed: true,
      claimedAt: paymentRecord.claimedAt,
      txHash: paymentRecord.txHash,
    },
  });
}

export async function reclaimBalance(req: Request, res: Response): Promise<void> {
  const { balanceId } = req.params;
  const { clinicId } = req.user!;

  const paymentRecord = await PaymentRecordModel.findOne({
    claimableBalanceId: balanceId,
    clinicId,
  });

  if (!paymentRecord) {
    res.status(404).json({
      success: false,
      error: 'Claimable balance not found',
    });
    return;
  }

  if (paymentRecord.claimed) {
    res.status(400).json({
      success: false,
      error: 'Balance already claimed, cannot reclaim',
    });
    return;
  }

  const now = new Date();

  if (paymentRecord.claimableUntil && now <= paymentRecord.claimableUntil) {
    res.status(400).json({
      success: false,
      error: 'Cannot reclaim before expiry date',
      claimableUntil: paymentRecord.claimableUntil,
    });
    return;
  }

  // In a real implementation, this would call the Stellar service to reclaim the balance
  // For now, we'll simulate it
  paymentRecord.status = 'failed';
  paymentRecord.txHash = `reclaim_${uuidv4().replace(/-/g, '')}`;
  await paymentRecord.save();

  res.json({
    success: true,
    data: {
      claimableBalanceId: paymentRecord.claimableBalanceId,
      reclaimed: true,
      txHash: paymentRecord.txHash,
    },
  });
}

export async function getClaimableBalanceStatus(req: Request, res: Response): Promise<void> {
  const { balanceId } = req.params;
  const { clinicId } = req.user!;

  const paymentRecord = await PaymentRecordModel.findOne({
    claimableBalanceId: balanceId,
    clinicId,
  }).lean();

  if (!paymentRecord) {
    res.status(404).json({
      success: false,
      error: 'Claimable balance not found',
    });
    return;
  }

  const now = new Date();
  let balanceStatus: 'pending' | 'claimable' | 'claimed' | 'expired' = 'pending';

  if (paymentRecord.claimed) {
    balanceStatus = 'claimed';
  } else if (paymentRecord.claimableUntil && now > paymentRecord.claimableUntil) {
    balanceStatus = 'expired';
  } else if (paymentRecord.claimableAfter && now >= paymentRecord.claimableAfter) {
    balanceStatus = 'claimable';
  }

  res.json({
    success: true,
    data: {
      claimableBalanceId: paymentRecord.claimableBalanceId,
      amount: paymentRecord.amount,
      destination: paymentRecord.destination,
      claimableAfter: paymentRecord.claimableAfter,
      claimableUntil: paymentRecord.claimableUntil,
      claimed: paymentRecord.claimed,
      claimedAt: paymentRecord.claimedAt,
      status: balanceStatus,
      encounterId: paymentRecord.encounterId,
    },
  });
}
