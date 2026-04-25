import { ClinicFeeBudgetModel, getCurrentMonth } from '../models/clinic-fee-budget.model';
import logger from '@api/utils/logger';

const DEFAULT_MONTHLY_BUDGET = 10_000_000; // stroops
const ALERT_THRESHOLD = 0.9;

/** Returns true if the clinic has budget remaining for the given feeAmount (stroops). */
export async function checkFeeBudget(clinicId: string, feeAmount: number): Promise<boolean> {
  const month = getCurrentMonth();
  const budget = await ClinicFeeBudgetModel.findOneAndUpdate(
    { clinicId, month },
    { $setOnInsert: { monthlyBudget: DEFAULT_MONTHLY_BUDGET, currentSpent: 0, transactions: [] } },
    { upsert: true, new: true }
  );

  const remaining = budget.monthlyBudget - budget.currentSpent;

  if (budget.currentSpent / budget.monthlyBudget >= ALERT_THRESHOLD) {
    logger.warn({ clinicId, month, currentSpent: budget.currentSpent, monthlyBudget: budget.monthlyBudget },
      'Clinic fee budget approaching limit (≥90%)');
  }

  return remaining >= feeAmount;
}

/** Record a sponsored fee against the clinic's monthly budget. */
export async function recordSponsoredFee(
  clinicId: string,
  transactionId: string,
  feeAmount: number
): Promise<void> {
  const month = getCurrentMonth();
  await ClinicFeeBudgetModel.findOneAndUpdate(
    { clinicId, month },
    {
      $inc: { currentSpent: feeAmount },
      $push: { transactions: { transactionId, feeAmount, timestamp: new Date() } },
    }
  );
}
