import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  // Add videoRoomUrl and recordingConsent fields to telemedicine appointments
  await db.collection('appointments').updateMany(
    { isTelemedicine: true, videoRoomUrl: { $exists: false } },
    { $set: { videoRoomUrl: null } },
  );

  await db.collection('appointments').updateMany(
    { recordingConsent: { $exists: false } },
    { $set: { recordingConsent: false } },
  );

  // Index to efficiently query active telemedicine appointments
  await db.collection('appointments').createIndex(
    { isTelemedicine: 1, status: 1 },
    { background: true, name: 'isTelemedicine_1_status_1', sparse: true },
  );
}

export async function down(db: Db): Promise<void> {
  await db.collection('appointments').updateMany(
    {},
    { $unset: { videoRoomUrl: '', recordingConsent: '' } },
  );

  await db.collection('appointments').dropIndex('isTelemedicine_1_status_1').catch(() => {});
}
