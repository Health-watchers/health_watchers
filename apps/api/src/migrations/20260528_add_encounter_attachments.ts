import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  // Add attachments array field to Encounter collection
  await db.collection('encounters').updateMany(
    {},
    {
      $set: {
        attachments: [],
      },
    }
  );

  // Create index for attachment queries
  await db.collection('encounters').createIndex(
    { 'attachments.fileId': 1 },
    { background: true, name: 'attachments_fileId_1', sparse: true }
  );
}

export async function down(db: Db): Promise<void> {
  // Remove attachments field
  await db.collection('encounters').updateMany(
    {},
    {
      $unset: {
        attachments: '',
      },
    }
  );

  // Drop index
  await db.collection('encounters').dropIndex('attachments_fileId_1').catch(() => {});
}
