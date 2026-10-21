jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { processDueDeliveries } from '../notification-dispatch-job';
import { NotificationDeliveryModel } from '../notification-delivery.model';
import { attemptDelivery } from '../notification-dispatch.service';

jest.mock('../notification-delivery.model', () => ({
  NotificationDeliveryModel: { find: jest.fn() },
}));
jest.mock('../notification-dispatch.service', () => ({ attemptDelivery: jest.fn() }));

const find = NotificationDeliveryModel.find as jest.Mock;
const mockAttempt = attemptDelivery as jest.Mock;

function queue(docs: unknown[]): void {
  find.mockReturnValue({
    sort: (): { limit: () => Promise<unknown[]> } => ({
      limit: (): Promise<unknown[]> => Promise.resolve(docs),
    }),
  });
}

beforeEach(() => jest.clearAllMocks());

describe('processDueDeliveries', () => {
  it('attempts every due delivery and returns the processed count', async () => {
    queue([{ _id: 'd1' }, { _id: 'd2' }, { _id: 'd3' }]);
    mockAttempt.mockResolvedValue('sent');

    const processed = await processDueDeliveries();

    expect(processed).toBe(3);
    expect(mockAttempt).toHaveBeenCalledTimes(3);
  });

  it('queries for scheduled, retry-due and brand-new pending deliveries', async () => {
    queue([]);
    await processDueDeliveries(new Date('2026-01-01T00:00:00Z'));

    const filter = find.mock.calls[0][0];
    expect(filter.status).toBe('pending');
    expect(Array.isArray(filter.$or)).toBe(true);
    expect(filter.$or).toHaveLength(3);
  });

  it('keeps going when one delivery attempt throws', async () => {
    queue([{ _id: 'd1' }, { _id: 'd2' }]);
    mockAttempt.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('sent');

    const processed = await processDueDeliveries();

    expect(processed).toBe(1);
    expect(mockAttempt).toHaveBeenCalledTimes(2);
  });
});
