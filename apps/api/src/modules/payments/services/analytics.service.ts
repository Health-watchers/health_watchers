import { PaymentRecordModel } from './models/payment-record.model';
import { XLMRateModel } from './models/xlm-rate.model';
import logger from '../../utils/logger';

export interface PaymentAnalytics {
  totalRevenue: {
    xlm: string;
    usdc: string;
    usdEquivalent: string;
  };
  transactionCount: {
    total: number;
    confirmed: number;
    pending: number;
    failed: number;
  };
  successRate: number;
  averageTransactionValue: {
    xlm: string;
    usd: string;
  };
  revenueByPeriod: Array<{
    period: string;
    xlm: string;
    usdc: string;
    usdEquivalent: string;
    count: number;
  }>;
  currencyDistribution: {
    xlm: { count: number; amount: string };
    usdc: { count: number; amount: string };
  };
}

/**
 * Get XLM/USD rate for a specific date
 */
export async function getXLMRate(date: Date): Promise<number> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const rate = await XLMRateModel.findOne({
    date: { $gte: startOfDay, $lte: endOfDay },
  });

  return rate?.rateUSD || 0.1; // Default fallback rate
}

/**
 * Store daily XLM/USD rate
 */
export async function storeXLMRate(date: Date, rateUSD: number): Promise<void> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  await XLMRateModel.updateOne(
    { date: startOfDay },
    { date: startOfDay, rateUSD },
    { upsert: true }
  );
}

/**
 * Calculate USD equivalent for XLM amount
 */
export async function calculateUSDEquivalent(xlmAmount: string, date: Date): Promise<string> {
  const rate = await getXLMRate(date);
  const xlmNum = parseFloat(xlmAmount);
  const usdNum = xlmNum * rate;
  return usdNum.toFixed(2);
}

/**
 * Get payment analytics for a clinic
 */
export async function getPaymentAnalytics(
  clinicId: string,
  from: Date,
  to: Date,
  groupBy: 'day' | 'week' | 'month' = 'month'
): Promise<PaymentAnalytics> {
  const payments = await PaymentRecordModel.find({
    clinicId,
    createdAt: { $gte: from, $lte: to },
    status: { $in: ['confirmed', 'pending', 'failed'] },
  }).lean();

  // Calculate totals
  let totalXLM = 0;
  let totalUSDC = 0;
  let totalUSD = 0;
  let confirmedCount = 0;
  let pendingCount = 0;
  let failedCount = 0;
  const xlmPayments: any[] = [];
  const usdcPayments: any[] = [];

  for (const payment of payments) {
    const amount = parseFloat(payment.amount);

    if (payment.status === 'confirmed') confirmedCount++;
    else if (payment.status === 'pending') pendingCount++;
    else if (payment.status === 'failed') failedCount++;

    if (payment.assetCode === 'XLM') {
      totalXLM += amount;
      xlmPayments.push(payment);
      const usdEquiv = await calculateUSDEquivalent(payment.amount, payment.createdAt);
      totalUSD += parseFloat(usdEquiv);
    } else if (payment.assetCode === 'USDC') {
      totalUSDC += amount;
      usdcPayments.push(payment);
      totalUSD += amount; // USDC is 1:1 with USD
    }
  }

  const totalCount = payments.length;
  const successRate = totalCount > 0 ? ((confirmedCount + pendingCount) / totalCount) * 100 : 0;

  // Calculate average transaction value
  const avgXLM = confirmedCount > 0 ? (totalXLM / confirmedCount).toFixed(7) : '0';
  const avgUSD = confirmedCount > 0 ? (totalUSD / confirmedCount).toFixed(2) : '0';

  // Group by period
  const revenueByPeriod = groupPaymentsByPeriod(payments, groupBy);

  // Currency distribution
  const currencyDistribution = {
    xlm: {
      count: xlmPayments.length,
      amount: totalXLM.toFixed(7),
    },
    usdc: {
      count: usdcPayments.length,
      amount: totalUSDC.toFixed(2),
    },
  };

  return {
    totalRevenue: {
      xlm: totalXLM.toFixed(7),
      usdc: totalUSDC.toFixed(2),
      usdEquivalent: totalUSD.toFixed(2),
    },
    transactionCount: {
      total: totalCount,
      confirmed: confirmedCount,
      pending: pendingCount,
      failed: failedCount,
    },
    successRate: parseFloat(successRate.toFixed(2)),
    averageTransactionValue: {
      xlm: avgXLM,
      usd: avgUSD,
    },
    revenueByPeriod,
    currencyDistribution,
  };
}

/**
 * Group payments by time period
 */
function groupPaymentsByPeriod(
  payments: any[],
  groupBy: 'day' | 'week' | 'month'
): Array<{
  period: string;
  xlm: string;
  usdc: string;
  usdEquivalent: string;
  count: number;
}> {
  const grouped: Record<string, any> = {};

  for (const payment of payments) {
    const date = new Date(payment.createdAt);
    let periodKey: string;

    if (groupBy === 'day') {
      periodKey = date.toISOString().split('T')[0];
    } else if (groupBy === 'week') {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      periodKey = weekStart.toISOString().split('T')[0];
    } else {
      periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    if (!grouped[periodKey]) {
      grouped[periodKey] = {
        xlm: 0,
        usdc: 0,
        usd: 0,
        count: 0,
      };
    }

    const amount = parseFloat(payment.amount);
    if (payment.assetCode === 'XLM') {
      grouped[periodKey].xlm += amount;
    } else if (payment.assetCode === 'USDC') {
      grouped[periodKey].usdc += amount;
      grouped[periodKey].usd += amount;
    }
    grouped[periodKey].count++;
  }

  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, data]) => ({
      period,
      xlm: data.xlm.toFixed(7),
      usdc: data.usdc.toFixed(2),
      usdEquivalent: data.usd.toFixed(2),
      count: data.count,
    }));
}

/**
 * Get revenue dashboard data
 */
export async function getRevenueDashboard(clinicId: string, months: number = 12) {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - months);

  const analytics = await getPaymentAnalytics(clinicId, from, to, 'month');

  return {
    monthlyRevenue: analytics.revenueByPeriod,
    successRate: analytics.successRate,
    totalRevenue: analytics.totalRevenue,
    transactionCount: analytics.transactionCount,
    currencyDistribution: analytics.currencyDistribution,
  };
}
