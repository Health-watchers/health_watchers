import {
  generateBillingInvoice,
  handlePaymentSuccess,
  suspendOverdueAccounts,
  renewSubscriptionPeriod,
} from '../billing.service';
import { SubscriptionModel } from '../subscription.model';
import { ClinicModel } from '../../clinics/clinic.model';

jest.mock('../subscription.model', () => ({
  SubscriptionModel: { findOne: jest.fn(), findByIdAndUpdate: jest.fn(), updateMany: jest.fn() },
}));
jest.mock('../../clinics/clinic.model', () => ({ ClinicModel: { findById: jest.fn() } }));

describe('generateBillingInvoice', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null when the clinic has no subscription', async () => {
    (SubscriptionModel.findOne as jest.Mock).mockResolvedValue(null);
    expect(await generateBillingInvoice('c1')).toBeNull();
  });

  it('returns null for a free-tier subscription', async () => {
    (SubscriptionModel.findOne as jest.Mock).mockResolvedValue({ tier: 'free' });
    expect(await generateBillingInvoice('c1')).toBeNull();
  });

  it('returns null when the clinic record cannot be found', async () => {
    (SubscriptionModel.findOne as jest.Mock).mockResolvedValue({
      tier: 'basic',
      _id: 's1',
      currentPeriodEnd: new Date('2026-02-01'),
    });
    (ClinicModel.findById as jest.Mock).mockResolvedValue(null);
    expect(await generateBillingInvoice('c1')).toBeNull();
  });

  it('generates an invoice with a 7-day grace period and marks the subscription past_due', async () => {
    (SubscriptionModel.findOne as jest.Mock).mockResolvedValue({
      tier: 'basic',
      _id: 's1',
      currentPeriodEnd: new Date('2026-02-01T00:00:00.000Z'),
      stellarPaymentAddress: undefined,
    });
    (ClinicModel.findById as jest.Mock).mockResolvedValue({ stellarPublicKey: 'GABC' });
    (SubscriptionModel.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

    const invoice = await generateBillingInvoice('c1');

    expect(invoice).toEqual(
      expect.objectContaining({
        clinicId: 'c1',
        tier: 'basic',
        amount: 49,
        currency: 'USD',
        stellarPaymentAddress: 'GABC',
      })
    );
    expect(invoice?.gracePeriodEnd.getTime() - invoice!.dueDate.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(SubscriptionModel.findByIdAndUpdate).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ status: 'past_due' })
    );
  });
});

describe('handlePaymentSuccess', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does nothing when there is no subscription', async () => {
    (SubscriptionModel.findOne as jest.Mock).mockResolvedValue(null);
    await handlePaymentSuccess('c1', 'pi_123');
    expect(SubscriptionModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('reactivates the subscription and rolls the period forward a month', async () => {
    (SubscriptionModel.findOne as jest.Mock).mockResolvedValue({
      _id: 's1',
      currentPeriodEnd: new Date('2026-02-01T00:00:00.000Z'),
    });

    await handlePaymentSuccess('c1', 'pi_123');

    expect(SubscriptionModel.findByIdAndUpdate).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        status: 'active',
        lastPaymentIntentId: 'pi_123',
        gracePeriodEnd: undefined,
      })
    );
  });
});

describe('suspendOverdueAccounts', () => {
  it('suspends subscriptions whose grace period has elapsed and returns the count', async () => {
    (SubscriptionModel.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 3 });

    const count = await suspendOverdueAccounts();

    expect(SubscriptionModel.updateMany).toHaveBeenCalledWith(
      { status: 'past_due', gracePeriodEnd: { $lt: expect.any(Date) } },
      { $set: { status: 'suspended' } }
    );
    expect(count).toBe(3);
  });
});

describe('renewSubscriptionPeriod', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does nothing when there is no subscription', async () => {
    (SubscriptionModel.findOne as jest.Mock).mockResolvedValue(null);
    await renewSubscriptionPeriod('c1');
    expect(SubscriptionModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('sets a fresh active period starting now', async () => {
    (SubscriptionModel.findOne as jest.Mock).mockResolvedValue({ _id: 's1' });

    await renewSubscriptionPeriod('c1');

    expect(SubscriptionModel.findByIdAndUpdate).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ status: 'active', gracePeriodEnd: undefined })
    );
  });
});
