import { Router, Request, Response } from 'express';
import { SubscriptionModel } from './subscription.model';
import { ClinicModel } from '../clinics/clinic.model';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { TIER_LIMITS, TIER_PRICES, SubscriptionTier } from './subscription.tiers';
import { generateBillingInvoice, handlePaymentSuccess, suspendOverdueAccounts } from './billing.service';
import { getUsage } from './usage.service';

const router = Router();

// GET /subscriptions/me — get current clinic's subscription + usage
router.get('/me', authenticate, async (req: Request, res: Response) => {
  const clinicId = req.user!.clinicId;
  if (!clinicId) return res.status(400).json({ error: 'No clinic associated with this account' });

  const [subscription, usage] = await Promise.all([
    SubscriptionModel.findOne({ clinicId }),
    getUsage(clinicId),
  ]);

  if (!subscription) {
    return res.status(404).json({ error: 'Subscription not found' });
  }

  const limits = TIER_LIMITS[subscription.tier];

  return res.json({
    status: 'success',
    data: {
      subscription,
      usage,
      limits,
      prices: TIER_PRICES,
    },
  });
});

// POST /subscriptions — create subscription for a clinic (SUPER_ADMIN or ADMIN)
router.post('/', authenticate, requireRoles('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  const { clinicId, tier = 'free', stellarPaymentAddress } = req.body;

  const targetClinicId = clinicId ?? req.user!.clinicId;
  if (!targetClinicId) return res.status(400).json({ error: 'clinicId is required' });

  const existing = await SubscriptionModel.findOne({ clinicId: targetClinicId });
  if (existing) return res.status(409).json({ error: 'Subscription already exists for this clinic' });

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const subscription = await SubscriptionModel.create({
    clinicId: targetClinicId,
    tier,
    status: 'active',
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    stellarPaymentAddress,
  });

  await ClinicModel.findByIdAndUpdate(targetClinicId, { subscriptionTier: tier });

  return res.status(201).json({ status: 'success', data: subscription });
});

// PUT /subscriptions/me/tier — upgrade or downgrade tier
router.put('/me/tier', authenticate, requireRoles('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  const clinicId = req.user!.clinicId;
  if (!clinicId) return res.status(400).json({ error: 'No clinic associated with this account' });

  const { tier } = req.body as { tier: SubscriptionTier };
  if (!['free', 'basic', 'premium'].includes(tier)) {
    return res.status(400).json({ error: 'Invalid tier. Must be free, basic, or premium' });
  }

  const subscription = await SubscriptionModel.findOneAndUpdate(
    { clinicId },
    { tier, cancelAtPeriodEnd: false },
    { new: true }
  );

  if (!subscription) return res.status(404).json({ error: 'Subscription not found' });

  await ClinicModel.findByIdAndUpdate(clinicId, { subscriptionTier: tier });

  return res.json({ status: 'success', data: subscription });
});

// PUT /subscriptions/me/cancel — cancel at period end
router.put('/me/cancel', authenticate, requireRoles('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  const clinicId = req.user!.clinicId;
  if (!clinicId) return res.status(400).json({ error: 'No clinic associated with this account' });

  const subscription = await SubscriptionModel.findOneAndUpdate(
    { clinicId },
    { cancelAtPeriodEnd: true, cancelledAt: new Date() },
    { new: true }
  );

  if (!subscription) return res.status(404).json({ error: 'Subscription not found' });

  return res.json({ status: 'success', data: subscription });
});

// POST /subscriptions/me/payment — record a payment
router.post('/me/payment', authenticate, requireRoles('SUPER_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  const clinicId = req.user!.clinicId;
  if (!clinicId) return res.status(400).json({ error: 'No clinic associated with this account' });

  const { paymentIntentId } = req.body;
  if (!paymentIntentId) return res.status(400).json({ error: 'paymentIntentId is required' });

  await handlePaymentSuccess(clinicId, paymentIntentId);

  return res.json({ status: 'success', message: 'Payment recorded and subscription renewed' });
});

// POST /subscriptions/billing/invoice — generate invoice for a clinic (SUPER_ADMIN)
router.post('/billing/invoice', authenticate, requireRoles('SUPER_ADMIN'), async (req: Request, res: Response) => {
  const { clinicId } = req.body;
  if (!clinicId) return res.status(400).json({ error: 'clinicId is required' });

  const invoice = await generateBillingInvoice(clinicId);
  if (!invoice) return res.status(400).json({ error: 'Cannot generate invoice for free tier or missing subscription' });

  return res.json({ status: 'success', data: invoice });
});

// POST /subscriptions/billing/suspend-overdue — suspend accounts past grace period (SUPER_ADMIN)
router.post('/billing/suspend-overdue', authenticate, requireRoles('SUPER_ADMIN'), async (_req: Request, res: Response) => {
  const count = await suspendOverdueAccounts();
  return res.json({ status: 'success', data: { suspended: count } });
});

// GET /subscriptions/tiers — public tier info
router.get('/tiers', (_req: Request, res: Response) => {
  const tiers = (['free', 'basic', 'premium'] as SubscriptionTier[]).map((tier) => ({
    tier,
    limits: TIER_LIMITS[tier],
    price: TIER_PRICES[tier],
  }));
  return res.json({ status: 'success', data: tiers });
});

export const subscriptionRoutes = router;
