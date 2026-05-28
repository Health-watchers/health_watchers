/**
 * Example: Recording metrics in payment processing
 */
import { paymentsConfirmedTotal, paymentsInitiatedTotal } from '@api/services/metrics.service';
import {
  recordPaymentSuccessRate,
  updatePaymentSuccessRateFromCounts,
} from '@api/services/business-metrics.service';

export async function processPayment(clinicId: string, amount: number) {
  try {
    paymentsInitiatedTotal.inc({ currency: 'USD' });

    // Process payment...
    const result = await stellarService.sendPayment(amount);

    paymentsConfirmedTotal.inc({ currency: 'USD' });

    // Update success rate
    const confirmed = await getConfirmedPaymentCount(clinicId);
    const initiated = await getInitiatedPaymentCount(clinicId);
    updatePaymentSuccessRateFromCounts(clinicId, confirmed, initiated);

    return result;
  } catch (error) {
    // Payment failed, success rate will decrease
    const confirmed = await getConfirmedPaymentCount(clinicId);
    const initiated = await getInitiatedPaymentCount(clinicId);
    updatePaymentSuccessRateFromCounts(clinicId, confirmed, initiated);
    throw error;
  }
}

/**
 * Example: Recording metrics in encounter creation
 */
import { recordEncounterDuration } from '@api/services/business-metrics.service';
import { encountersCreatedTotal } from '@api/services/metrics.service';

export async function createEncounter(clinicId: string, patientId: string) {
  const startTime = Date.now();
  encountersCreatedTotal.inc({ clinicId });

  try {
    // Create encounter...
    const encounter = await Encounter.create({
      clinicId,
      patientId,
      // ... other fields
    });

    const durationSeconds = (Date.now() - startTime) / 1000;
    recordEncounterDuration(clinicId, durationSeconds);

    return encounter;
  } catch (error) {
    const durationSeconds = (Date.now() - startTime) / 1000;
    recordEncounterDuration(clinicId, durationSeconds);
    throw error;
  }
}

/**
 * Example: Recording metrics in authentication
 */
import { updateActiveUsers } from '@api/services/business-metrics.service';

export async function handleUserLogin(clinicId: string) {
  // ... login logic ...

  // Update active users count
  const activeCount = await getActiveUserCount(clinicId);
  updateActiveUsers(clinicId, activeCount);
}

export async function handleUserLogout(clinicId: string) {
  // ... logout logic ...

  // Update active users count
  const activeCount = await getActiveUserCount(clinicId);
  updateActiveUsers(clinicId, activeCount);
}

/**
 * Example: Recording metrics in API key usage
 */
import { recordApiKeyRequest } from '@api/services/business-metrics.service';

export function apiKeyMiddleware(req: Request, res: Response, next: Function) {
  const apiKeyId = req.headers['x-api-key'];
  const endpoint = req.path;

  if (apiKeyId) {
    recordApiKeyRequest(apiKeyId as string, endpoint);
  }

  next();
}

/**
 * Example: Recording metrics in Stellar transactions
 */
import { recordStellarTransactionFee } from '@api/services/business-metrics.service';

export async function sendStellarPayment(clinicId: string, amount: number) {
  const transaction = await stellarService.buildTransaction({
    amount,
    // ... other params
  });

  const feeXlm = parseFloat(transaction.fee_charged) / 10000000; // stroops to XLM
  recordStellarTransactionFee(clinicId, 'payment', feeXlm);

  return await stellarService.submitTransaction(transaction);
}
