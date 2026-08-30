import { incrementUsage, getUsage, resetUsageForPeriod } from '../usage.service';
import { UsageModel } from '../usage.model';
import { SubscriptionModel } from '../subscription.model';

jest.mock('../usage.model', () => ({
  UsageModel: { findOneAndUpdate: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../subscription.model', () => ({ SubscriptionModel: { findOne: jest.fn() } }));

describe('incrementUsage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('increments the given field for the subscription billing period', async () => {
    const periodStart = new Date('2026-01-01');
    const periodEnd = new Date('2026-02-01');
    (SubscriptionModel.findOne as jest.Mock).mockResolvedValue({
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    });
    (UsageModel.findOneAndUpdate as jest.Mock).mockResolvedValue({});

    await incrementUsage('c1', 'patientCount');

    expect(UsageModel.findOneAndUpdate).toHaveBeenCalledWith(
      { clinicId: 'c1', periodStart, periodEnd },
      { $inc: { patientCount: 1 } },
      { upsert: true, new: true }
    );
  });

  it('increments by the given amount', async () => {
    (SubscriptionModel.findOne as jest.Mock).mockResolvedValue(null);
    (UsageModel.findOneAndUpdate as jest.Mock).mockResolvedValue({});

    await incrementUsage('c1', 'encounterCount', 5);

    expect(UsageModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ clinicId: 'c1' }),
      { $inc: { encounterCount: 5 } },
      { upsert: true, new: true }
    );
  });

  it('falls back to a rolling monthly period when there is no subscription', async () => {
    (SubscriptionModel.findOne as jest.Mock).mockResolvedValue(null);
    (UsageModel.findOneAndUpdate as jest.Mock).mockResolvedValue({});

    await incrementUsage('c1', 'aiRequestCount');

    const [filter] = (UsageModel.findOneAndUpdate as jest.Mock).mock.calls[0];
    expect(filter.periodEnd.getTime()).toBeGreaterThan(filter.periodStart.getTime());
  });
});

describe('getUsage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the stored usage document when one exists', async () => {
    (SubscriptionModel.findOne as jest.Mock).mockResolvedValue(null);
    (UsageModel.findOne as jest.Mock).mockResolvedValue({ patientCount: 3 });

    const usage = await getUsage('c1');

    expect(usage).toEqual({ patientCount: 3 });
  });

  it('returns a zeroed default when there is no usage document', async () => {
    (SubscriptionModel.findOne as jest.Mock).mockResolvedValue(null);
    (UsageModel.findOne as jest.Mock).mockResolvedValue(null);

    const usage = await getUsage('c1');

    expect(usage).toEqual({
      patientCount: 0,
      encounterCount: 0,
      aiRequestCount: 0,
      doctorCount: 0,
      userCount: 0,
    });
  });
});

describe('resetUsageForPeriod', () => {
  it('resets all counters to zero for the given period', async () => {
    (UsageModel.findOneAndUpdate as jest.Mock).mockResolvedValue({});
    const periodStart = new Date('2026-01-01');
    const periodEnd = new Date('2026-02-01');

    await resetUsageForPeriod('c1', periodStart, periodEnd);

    expect(UsageModel.findOneAndUpdate).toHaveBeenCalledWith(
      { clinicId: 'c1', periodStart, periodEnd },
      {
        $set: {
          patientCount: 0,
          encounterCount: 0,
          aiRequestCount: 0,
          doctorCount: 0,
          userCount: 0,
        },
      },
      { upsert: true }
    );
  });
});
