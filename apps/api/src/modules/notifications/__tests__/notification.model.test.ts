import mongoose from 'mongoose';
import { NotificationModel } from '../notification.model';

const baseDoc = {
  userId: new mongoose.Types.ObjectId(),
  clinicId: new mongoose.Types.ObjectId(),
  type: 'system',
  title: 'Welcome',
  message: 'Your account has been created.',
};

describe('NotificationModel', () => {
  it('validates a complete notification', async () => {
    const notification = new NotificationModel(baseDoc);
    await expect(notification.validate()).resolves.toBeUndefined();
  });

  it('requires title and message', async () => {
    const notification = new NotificationModel({ ...baseDoc, title: undefined });
    await expect(notification.validate()).rejects.toThrow(/title/);
  });

  it('rejects an invalid notification type', async () => {
    const notification = new NotificationModel({ ...baseDoc, type: 'carrier_pigeon' });
    await expect(notification.validate()).rejects.toThrow();
  });

  it('defaults isRead to false', () => {
    const notification = new NotificationModel(baseDoc);
    expect(notification.isRead).toBe(false);
  });
});
