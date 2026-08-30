import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { sweepApiKeyLifecycle } from '../api-key-lifecycle-job';
import { ApiKeyModel } from '../models/api-key.model';
import { createNotification } from '../../notifications/notification.service';

jest.mock('../models/api-key.model');
jest.mock('../../notifications/notification.service', () => ({
  createNotification: jest.fn(),
}));
jest.mock('../../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const model = ApiKeyModel as jest.Mocked<typeof ApiKeyModel>;

describe('sweepApiKeyLifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (model.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 0 } as any);
    (model.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 1 } as any);
    (model.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    } as any);
  });

  it('deactivates expired keys and clears closed grace windows', async () => {
    (model.updateMany as jest.Mock)
      .mockResolvedValueOnce({ modifiedCount: 3 } as any) // deactivate
      .mockResolvedValueOnce({ modifiedCount: 2 } as any); // grace clear

    const result = await sweepApiKeyLifecycle(new Date('2026-08-30T00:00:00Z'));

    expect(result.deactivated).toBe(3);
    expect(result.graceCleared).toBe(2);

    const firstCall = (model.updateMany as jest.Mock).mock.calls[0][0] as any;
    expect(firstCall.isActive).toBe(true);
    expect(firstCall.expiresAt.$lt).toBeInstanceOf(Date);

    const secondCall = (model.updateMany as jest.Mock).mock.calls[1][1] as any;
    expect(secondCall.$unset).toHaveProperty('previousKeyHash');
  });

  it('sends a one-time expiry warning and marks the key', async () => {
    (model.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: 'k1',
            name: 'CI key',
            clinicId: 'c1',
            createdBy: 'u1',
            expiresAt: new Date('2026-09-02T00:00:00Z'),
          },
        ]),
      }),
    } as any);

    const result = await sweepApiKeyLifecycle(new Date('2026-08-30T00:00:00Z'));

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'system', title: 'API key expiring soon' })
    );
    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: 'k1' },
      { $set: { expiryWarningSentAt: expect.any(Date) } }
    );
    expect(result.warned).toBe(1);
  });
});
