import { Request, Response } from 'express';
import { checkSubscriptionLimit } from '../subscription.middleware';
import { SubscriptionModel } from '../../modules/subscriptions/subscription.model';
import { UsageModel } from '../../modules/subscriptions/usage.model';
import { createNotification } from '../../modules/notifications/notification.service';
import { UserModel } from '../../modules/auth/models/user.model';

jest.mock('../../modules/subscriptions/subscription.model', () => ({
  SubscriptionModel: { findOne: jest.fn() },
}));
jest.mock('../../modules/subscriptions/usage.model', () => ({
  UsageModel: { findOne: jest.fn() },
}));
jest.mock('../../modules/notifications/notification.service', () => ({
  createNotification: jest.fn(),
}));
jest.mock('../../modules/auth/models/user.model', () => ({
  UserModel: { find: jest.fn() },
}));

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

function mockReq(clinicId?: string): Request {
  return { user: clinicId ? { clinicId, userId: 'u1', role: 'DOCTOR' } : undefined } as Request;
}

describe('checkSubscriptionLimit', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls next when there is no clinic context', async () => {
    const next = jest.fn();
    await checkSubscriptionLimit('patients')(mockReq(undefined), mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(SubscriptionModel.findOne).not.toHaveBeenCalled();
  });

  it('calls next when the clinic has no subscription record', async () => {
    (SubscriptionModel.findOne as jest.Mock).mockResolvedValue(null);
    const next = jest.fn();

    await checkSubscriptionLimit('patients')(mockReq('c1'), mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 402 when the subscription is suspended', async () => {
    (SubscriptionModel.findOne as jest.Mock).mockResolvedValue({ status: 'suspended', tier: 'free' });
    const res = mockRes();
    const next = jest.fn();

    await checkSubscriptionLimit('patients')(mockReq('c1'), res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'AccountSuspended' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 402 with limit details when the clinic is at its patient limit', async () => {
    (SubscriptionModel.findOne as jest.Mock).mockResolvedValue({ status: 'active', tier: 'free' });
    (UsageModel.findOne as jest.Mock).mockResolvedValue({ patientCount: 100, encounterCount: 0, aiRequestCount: 0, doctorCount: 0, userCount: 0 });
    const res = mockRes();
    const next = jest.fn();

    await checkSubscriptionLimit('patients')(mockReq('c1'), res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'SubscriptionLimitExceeded', limit: 100, current: 100, tier: 'free' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when usage is below the limit', async () => {
    (SubscriptionModel.findOne as jest.Mock).mockResolvedValue({ status: 'active', tier: 'basic' });
    (UsageModel.findOne as jest.Mock).mockResolvedValue({ patientCount: 10, encounterCount: 0, aiRequestCount: 0, doctorCount: 0, userCount: 0 });
    const res = mockRes();
    const next = jest.fn();

    await checkSubscriptionLimit('patients')(mockReq('c1'), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('treats a missing usage record as zero usage and calls next', async () => {
    (SubscriptionModel.findOne as jest.Mock).mockResolvedValue({ status: 'active', tier: 'premium' });
    (UsageModel.findOne as jest.Mock).mockResolvedValue(null);
    const res = mockRes();
    const next = jest.fn();

    await checkSubscriptionLimit('patients')(mockReq('c1'), res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('sends a warning notification to clinic admins at 80-90% usage', async () => {
    (SubscriptionModel.findOne as jest.Mock).mockResolvedValue({ status: 'active', tier: 'free' });
    (UsageModel.findOne as jest.Mock).mockResolvedValue({ patientCount: 85, encounterCount: 0, aiRequestCount: 0, doctorCount: 0, userCount: 0 });
    (UserModel.find as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue([{ _id: 'admin1' }]) });
    const res = mockRes();
    const next = jest.fn();

    await checkSubscriptionLimit('patients')(mockReq('c1'), res, next);

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'admin1', clinicId: 'c1', type: 'subscription_warning' })
    );
    expect(next).toHaveBeenCalledTimes(1);
  });
});
