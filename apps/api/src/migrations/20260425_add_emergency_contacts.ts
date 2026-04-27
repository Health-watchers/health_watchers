import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  await db
    .collection('patients')
    .updateMany({ emergencyContacts: { $exists: false } }, { $set: { emergencyContacts: [] } });
}

export async function down(db: Db): Promise<void> {
  await db.collection('patients').updateMany({}, { $unset: { emergencyContacts: '' } });
}
