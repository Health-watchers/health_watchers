import { Request, Response, NextFunction } from 'express';
import { checkFeeBudget } from '../modules/payments/services/fee-budget.service';

const BASE_FEE_STROOPS = 100;
const FEE_BUMP_STROOPS = BASE_FEE_STROOPS * 10;

/**
 * Middleware that gates fee-sponsored requests.
 * Attaches `req.feeSponsorshipAllowed` so the handler can decide whether to wrap in a fee bump.
 * Does NOT block the request — sponsorship is simply skipped when budget is exhausted.
 */
export async function feeBudgetCheck(req: Request, _res: Response, next: NextFunction) {
  if (!req.body?.sponsorFee) return next();

  const clinicId = req.user?.clinicId;
  if (!clinicId) return next();

  try {
    (req as any).feeSponsorshipAllowed = await checkFeeBudget(String(clinicId), FEE_BUMP_STROOPS);
  } catch {
    (req as any).feeSponsorshipAllowed = false;
  }

  return next();
}
