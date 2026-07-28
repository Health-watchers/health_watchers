import { createNotification } from '../notification.service';
import { NotificationModel } from '../notification.model';
import { UserModel } from '../../auth/models/user.model';
import { emitToUser } from '@api/realtime/socket';

jest.mock('../notification.model', () => ({ NotificationModel: { create: jest.fn() } }));
jest.mock('../../auth/models/user.model', () => ({ UserModel: { findById: jest.fn() } }));
jest.mock('@api/realtime/socket', () => ({ emitToUser: jest.fn() }));

function userQuery(user: unknown) {
  return { lean: jest.fn().mockResolvedValue(user) };
}

describe('createNotification', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a notification and emits a realtime event by default', async () => {
    (UserModel.findById as jest.Mock).mockReturnValue(userQuery({ preferences: {} }));
    const created = { _id: 'n1', toObject: () => ({ _id: 'n1' }) };
    (NotificationModel.create as jest.Mock).mockResolvedValue(created);

    const result = await createNotification({
      userId: 'u1',
      clinicId: 'c1',
      type: 'system',
      title: 'Hi',
      message: 'Hello there',
    });

    expect(NotificationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', clinicId: 'c1', expiresAt: expect.any(Date) })
    );
    expect(emitToUser).toHaveBeenCalledWith('u1', 'notification:new', { _id: 'n1' });
    expect(result).toBe(created);
  });

  it('returns null and skips creation when the user disabled in-app notifications', async () => {
    (UserModel.findById as jest.Mock).mockReturnValue(
      userQuery({ preferences: { inAppNotifications: false } })
    );

    const result = await createNotification({
      userId: 'u1',
      clinicId: 'c1',
      type: 'system',
      title: 'Hi',
      message: 'Hello',
    });

    expect(result).toBeNull();
    expect(NotificationModel.create).not.toHaveBeenCalled();
  });

  it('returns null when the specific notification type is disabled', async () => {
    (UserModel.findById as jest.Mock).mockReturnValue(
      userQuery({ preferences: { notificationTypes: { system: false } } })
    );

    const result = await createNotification({
      userId: 'u1',
      clinicId: 'c1',
      type: 'system',
      title: 'Hi',
      message: 'Hello',
    });

    expect(result).toBeNull();
    expect(NotificationModel.create).not.toHaveBeenCalled();
  });

  it('uses a caller-provided expiresAt instead of the 30-day default', async () => {
    (UserModel.findById as jest.Mock).mockReturnValue(userQuery(null));
    (NotificationModel.create as jest.Mock).mockResolvedValue({ toObject: () => ({}) });
    const customExpiry = new Date('2030-01-01');

    await createNotification({
      userId: 'u1',
      clinicId: 'c1',
      type: 'system',
      title: 'Hi',
      message: 'Hello',
      expiresAt: customExpiry,
    });

    expect(NotificationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: customExpiry })
    );
  });

  it('does not throw when emitting the realtime event fails', async () => {
    (UserModel.findById as jest.Mock).mockReturnValue(userQuery(null));
    (NotificationModel.create as jest.Mock).mockResolvedValue({ toObject: () => ({}) });
    (emitToUser as jest.Mock).mockImplementation(() => {
      throw new Error('socket not initialised');
    });

    await expect(
      createNotification({ userId: 'u1', clinicId: 'c1', type: 'system', title: 'Hi', message: 'Hello' })
    ).resolves.toBeDefined();
  });
});
