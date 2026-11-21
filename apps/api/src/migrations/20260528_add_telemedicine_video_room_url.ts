import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  // Add videoRoomUrl and recordingConsent fields to telemedicine appointments
  await db
    .collection('appointments')
    .updateMany(
      { isTelemedicine: true, videoRoomUrl: { $exists: false } },
      { $set: { videoRoomUrl: null } }
    );

  await db
    .collection('appointments')
    .updateMany({ recordingConsent: { $exists: false } }, { $set: { recordingConsent: false } });

  // Backfill telemedicine session metadata fields
  await db
    .collection('appointments')
    .updateMany(
      { isTelemedicine: true, videoSessionStartedAt: { $exists: false } },
      { $set: { videoSessionStartedAt: null } }
    );

  await db
    .collection('appointments')
    .updateMany(
      { isTelemedicine: true, videoSessionEndedAt: { $exists: false } },
      { $set: { videoSessionEndedAt: null } }
    );

  await db
    .collection('appointments')
    .updateMany(
      { isTelemedicine: true, videoSessionDurationMinutes: { $exists: false } },
      { $set: { videoSessionDurationMinutes: null } }
    );

  await db
    .collection('appointments')
    .updateMany(
      { isTelemedicine: true, videoSessionParticipants: { $exists: false } },
      { $set: { videoSessionParticipants: [] } }
    );

  await db
    .collection('appointments')
    .updateMany(
      { isTelemedicine: true, videoWaitingRoomEnabled: { $exists: false } },
      { $set: { videoWaitingRoomEnabled: true } }
    );

  // Index to efficiently query active telemedicine appointments
  await db
    .collection('appointments')
    .createIndex(
      { isTelemedicine: 1, status: 1 },
      { background: true, name: 'isTelemedicine_1_status_1', sparse: true }
    );

  // Sparse index for billing queries on telemedicine sessions
  await db
    .collection('appointments')
    .createIndex(
      { isTelemedicine: 1, videoSessionStartedAt: 1 },
      { background: true, name: 'isTelemedicine_1_videoSessionStartedAt_1', sparse: true }
    );
}

export async function down(db: Db): Promise<void> {
  await db.collection('appointments').updateMany(
    {},
    {
      $unset: {
        videoRoomUrl: '',
        recordingConsent: '',
        videoSessionStartedAt: '',
        videoSessionEndedAt: '',
        videoSessionDurationMinutes: '',
        videoSessionParticipants: '',
        videoWaitingRoomEnabled: '',
      },
    }
  );

  await db
    .collection('appointments')
    .dropIndex('isTelemedicine_1_status_1')
    .catch(() => {});

  await db
    .collection('appointments')
    .dropIndex('isTelemedicine_1_videoSessionStartedAt_1')
    .catch(() => {});
}