import { randomUUID } from 'crypto';
import { PaymentRecordModel } from './models/payment-record.model';
import { PaymentDisputeModel } from './models/payment-dispute.model';
import { ClinicSettingsModel } from '../clinics/clinic-settings.model';
import { stellarClient } from './services/stellar-client';
import { feeOptimizer } from './services/fee-optimizer.service';
import { confirmPayment } from './services/payment-confirmation.service';
import { toPaymentResponse } from './payments.transformer';
import logger from '@api/utils/logger';
import { cache } from '@api/services/cache.service';
import { paymentsInitiatedTotal, feeStrategySelectedTotal } from '@api/services/metrics.service';
import { withSpan } from '@api/utils/tracer';

/**
 * Get Stellar network fee statistics
 * @returns Fee estimate data
 */
export async function getFeeEstimate() {
  return await stellarClient.getFeeEstimate();
}

/**
 * Get clinic's Stellar account balance
 * @param clinicId - The clinic ID
 * @returns Account balance information
 */
export async function getClinicBalance(clinicId: string) {
  const settings = await ClinicSettingsModel.findOne({ clinicId });
  if (!settings?.stellarPublicKey) {
    throw new Error('Stellar public key not configured for this clinic');
  }

  const balance = await stellarClient.getBalance(settings.stellarPublicKey);
  return {
    publicKey: settings.stellarPublicKey,
    federationAddress: settings.federationAddress,
    ...balance,
  };
}

/**
 * Fund testnet account via Friendbot
 * @param clinicId - The clinic ID
 * @returns Funding transaction result
 */
export async function fundTestnetAccount(clinicId: string) {
  const settings = await ClinicSettingsModel.findOne({ clinicId });
  if (!settings?.stellarPublicKey) {
    throw new Error('Stellar public key not configured');
  }

  const result = await stellarClient.fundTestnetAccount(settings.stellarPublicKey);
  return result;
}

/**
 * Create USDC trustline for clinic's Stellar account
 * @param clinicId - The clinic ID
 * @param secretKey - The clinic's Stellar secret key
 * @returns Trustline creation result
 */
export async function createUsdcTrustline(clinicId: string, secretKey: string) {
  const settings = await ClinicSettingsModel.findOne({ clinicId });
  if (!settings?.stellarPublicKey) {
    throw new Error('Stellar public key not configured');
  }

  const result = await stellarClient.createUsdcTrustline(secretKey);
  return result;
}

/**
 * Get paginated payment list for a clinic
 * @param clinicId - The clinic ID
 * @param query - Query parameters (page, pageSize, status, etc.)
 * @returns Paginated payment records
 */
export async function getPaymentsList(clinicId: string, query: any) {
  const { page = 1, pageSize = 20, status, patientId, startDate, endDate } = query;

  const filter: any = { clinicId };
  if (status) filter.status = status;
  if (patientId) filter.patientId = patientId;
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const sort = { createdAt: -1 };
  const records = await PaymentRecordModel.find(filter)
    .sort(sort)
    .skip((page - 1) * pageSize)
    .limit(pageSize);

  const total = await PaymentRecordModel.countDocuments(filter);

  return {
    items: records.map(toPaymentResponse),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/**
 * Create a payment intent
 * @param clinicId - The clinic ID
 * @param data - Payment intent data
 * @returns Created payment record
 */
export async function createPaymentIntent(clinicId: string, data: any) {
  const {
    patientId,
    encounterId,
    amount,
    asset = 'native',
    description,
    metadata,
    feeStrategy = 'standard',
    escrow,
  } = data;

  const settings = await ClinicSettingsModel.findOne({ clinicId });
  if (!settings?.stellarPublicKey) {
    throw new Error('Clinic Stellar account not configured');
  }

  const intentId = randomUUID();
  const memo = intentId.replace(/-/g, '').substring(0, 28);

  // Determine optimal fee
  const feeAmount = await feeOptimizer.calculateOptimalFee(feeStrategy);

  // Record metrics
  paymentsInitiatedTotal.inc({ clinic_id: clinicId, asset });
  feeStrategySelectedTotal.inc({ strategy: feeStrategy });

  const paymentRecord = await PaymentRecordModel.create({
    clinicId,
    patientId,
    encounterId,
    intentId,
    amount,
    asset,
    description,
    status: 'pending',
    stellarMemo: memo,
    recipientAddress: settings.stellarPublicKey,
    feeAmount,
    feeStrategy,
    escrow: escrow
      ? {
          enabled: true,
          releaseCondition: escrow.releaseCondition,
          claimant: escrow.claimant,
          expiry: escrow.expiry ? new Date(escrow.expiry) : undefined,
        }
      : undefined,
    metadata,
  });

  // Invalidate cache
  await cache.del(`dashboard:${clinicId}`);

  logger.info(`Payment intent created: ${intentId} for clinic ${clinicId}`);

  return toPaymentResponse(paymentRecord);
}

/**
 * Confirm a payment
 * @param clinicId - The clinic ID
 * @param intentId - The payment intent ID
 * @param data - Confirmation data (transactionHash)
 * @returns Updated payment record
 */
export async function confirmPaymentIntent(clinicId: string, intentId: string, data: any) {
  const { transactionHash } = data;

  const record = await PaymentRecordModel.findOne({ clinicId, intentId });
  if (!record) {
    throw new Error('Payment intent not found');
  }

  if (record.status === 'confirmed') {
    return toPaymentResponse(record);
  }

  const updatedRecord = await confirmPayment(record, transactionHash);

  // Invalidate cache
  await cache.del(`dashboard:${clinicId}`);

  return toPaymentResponse(updatedRecord);
}

/**
 * Get payment analytics for a clinic
 * @param clinicId - The clinic ID
 * @param startDate - Start date filter
 * @param endDate - End date filter
 * @returns Analytics data
 */
export async function getPaymentAnalytics(clinicId: string, startDate?: string, endDate?: string) {
  const filter: any = { clinicId };
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const payments = await PaymentRecordModel.find(filter);

  const totalRevenue = {
    xlm: payments
      .filter((p) => p.asset === 'native' && p.status === 'confirmed')
      .reduce((sum, p) => sum + parseFloat(p.amount), 0)
      .toFixed(7),
    usdc: payments
      .filter((p) => p.asset === 'USDC' && p.status === 'confirmed')
      .reduce((sum, p) => sum + parseFloat(p.amount), 0)
      .toFixed(2),
  };

  const transactionCount = {
    total: payments.length,
    confirmed: payments.filter((p) => p.status === 'confirmed').length,
    pending: payments.filter((p) => p.status === 'pending').length,
    failed: payments.filter((p) => p.status === 'failed').length,
  };

  const successRate =
    transactionCount.total > 0
      ? (transactionCount.confirmed / transactionCount.total) * 100
      : 0;

  return {
    totalRevenue,
    transactionCount,
    successRate: parseFloat(successRate.toFixed(2)),
  };
}

/**
 * Sync payments with Stellar Horizon
 * @param clinicId - The clinic ID
 * @returns Sync result
 */
export async function syncPaymentsWithHorizon(clinicId: string) {
  const settings = await ClinicSettingsModel.findOne({ clinicId });
  if (!settings?.stellarPublicKey) {
    throw new Error('Stellar public key not configured');
  }

  const pendingPayments = await PaymentRecordModel.find({
    clinicId,
    status: 'pending',
  });

  let updated = 0;
  let failed = 0;

  for (const payment of pendingPayments) {
    try {
      const txData = await stellarClient.getTransaction(payment.stellarMemo);
      if (txData && txData.successful) {
        payment.status = 'confirmed';
        payment.stellarTransactionHash = txData.hash;
        payment.confirmedAt = new Date(txData.created_at);
        await payment.save();
        updated++;
      }
    } catch (error) {
      logger.error(`Failed to sync payment ${payment.intentId}:`, error);
      failed++;
    }
  }

  return { updated, failed, total: pendingPayments.length };
}

/**
 * Get reconciliation report
 * @param clinicId - The clinic ID
 * @returns Reconciliation data
 */
export async function getReconciliationReport(clinicId: string) {
  const settings = await ClinicSettingsModel.findOne({ clinicId });
  if (!settings?.stellarPublicKey) {
    throw new Error('Stellar public key not configured');
  }

  const dbPayments = await PaymentRecordModel.find({ clinicId, status: 'confirmed' });
  const horizonPayments = await stellarClient.getPaymentHistory(settings.stellarPublicKey);

  const dbTotal = dbPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  const horizonTotal = horizonPayments.reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0);

  const discrepancy = Math.abs(dbTotal - horizonTotal);

  return {
    dbCount: dbPayments.length,
    horizonCount: horizonPayments.length,
    dbTotal: dbTotal.toFixed(7),
    horizonTotal: horizonTotal.toFixed(7),
    discrepancy: discrepancy.toFixed(7),
    inSync: discrepancy < 0.0000001,
  };
}
