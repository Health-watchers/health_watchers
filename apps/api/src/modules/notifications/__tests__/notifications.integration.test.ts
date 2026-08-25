/**
 * Integration tests for the notifications module.
 *
 * Uses MongoDB Memory Server for a real in-process database and mounts only
 * the notifications router in a minimal Express app.
 */

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';
process.env.API_PORT = '3001';
process.env.NODE_ENV = 'test';

jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'test-access-secret-32-chars-long!!',
      refreshTokenSecret: 'test-refresh-secret-32-chars-long!',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
    apiPort: '3001',
    nodeEnv: 'test',
    mongoUri: '',
  },
}));

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { NotificationModel } from '../notification.model';
import { notificationRoutes } from '../notifications.controller';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/notifications', notificationRoutes);
  return app;
}

const SECRET = 'test-access-secret-32-chars-long!!';

function makeToken(userId: string, clinicId = new mongoose.Types.ObjectId().toString(), role = 'DOCTOR') {
  return jwt.sign({ userId, role, clinicId }, SECRET, {
    expiresIn: '15m',
    issuer: 'health-watchers-api',
    audience: 'health-watchers-client',
  });
}

const USER_1 = new mongoose.Types.ObjectId().toString();
const USER_2 = new mongoose.Types.ObjectId().toString();
const CLINIC = new mongoose.Types.ObjectId().toString();

function seedNotification(overrides: Record<string, unknown> = {}) {
  return NotificationModel.create({
    userId: USER_1,
    clinicId: CLINIC,
    type: 'system',
    title: 'Notice',
    message: 'Something happened',
    ...overrides,
  });
}

let mongod: MongoMemoryServer;
let app: express.Express;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = buildApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await NotificationModel.deleteMany({});
});

describe('GET /api/v1/notifications', () => {
  it('returns only the caller notifications, paginated', async () => {
    await seedNotification({ title: 'A' });
    await seedNotification({ userId: USER_2, title: 'Someone else' });

    const token = makeToken(USER_1);
    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('A');
    expect(res.body.pagination).toEqual(expect.objectContaining({ page: 1, limit: 20, total: 1 }));
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app).get('/api/v1/notifications');
    expect(res.status).toBe(401);
  });

  it('returns 400 for an out-of-range limit', async () => {
    const token = makeToken(USER_1);
    const res = await request(app)
      .get('/api/v1/notifications?limit=500')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/notifications/unread-count', () => {
  it('counts only unread notifications for the caller', async () => {
    await seedNotification({ isRead: false });
    await seedNotification({ isRead: true });
    await seedNotification({ userId: USER_2, isRead: false });

    const token = makeToken(USER_1);
    const res = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(1);
  });
});

describe('PUT /api/v1/notifications/:id/read', () => {
  it("marks the caller's own notification as read", async () => {
    const notification = await seedNotification();
    const token = makeToken(USER_1);

    const res = await request(app)
      .put(`/api/v1/notifications/${notification._id}/read`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isRead).toBe(true);
  });

  it('returns 404 when trying to mark another user notification as read', async () => {
    const notification = await seedNotification();
    const otherUserToken = makeToken(USER_2);

    const res = await request(app)
      .put(`/api/v1/notifications/${notification._id}/read`)
      .set('Authorization', `Bearer ${otherUserToken}`);

    expect(res.status).toBe(404);

    const stillUnread = await NotificationModel.findById(notification._id);
    expect(stillUnread?.isRead).toBe(false);
  });

  it('returns 400 for a malformed notification id', async () => {
    const token = makeToken(USER_1);
    const res = await request(app)
      .put('/api/v1/notifications/not-an-id/read')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

describe('PUT /api/v1/notifications/read-all', () => {
  it("marks all of the caller's unread notifications as read, leaving other users untouched", async () => {
    await seedNotification({ isRead: false });
    await seedNotification({ isRead: false });
    const otherUsersNotification = await seedNotification({ userId: USER_2, isRead: false });

    const token = makeToken(USER_1);
    const res = await request(app)
      .put('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const remainingUnread = await NotificationModel.countDocuments({ userId: USER_1, isRead: false });
    expect(remainingUnread).toBe(0);

    const other = await NotificationModel.findById(otherUsersNotification._id);
    expect(other?.isRead).toBe(false);
  });
});

describe('DELETE /api/v1/notifications/:id', () => {
  it("deletes the caller's own notification", async () => {
    const notification = await seedNotification();
    const token = makeToken(USER_1);

    const res = await request(app)
      .delete(`/api/v1/notifications/${notification._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(await NotificationModel.findById(notification._id)).toBeNull();
  });

  it('returns 404 and does not delete another user notification', async () => {
    const notification = await seedNotification();
    const otherUserToken = makeToken(USER_2);

    const res = await request(app)
      .delete(`/api/v1/notifications/${notification._id}`)
      .set('Authorization', `Bearer ${otherUserToken}`);

    expect(res.status).toBe(404);
    expect(await NotificationModel.findById(notification._id)).not.toBeNull();
  });
});
