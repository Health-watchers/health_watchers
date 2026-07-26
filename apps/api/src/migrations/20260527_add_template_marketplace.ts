import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  // Add marketplace fields to encounter templates
  await db.collection('encountertemplates').updateMany(
    {},
    {
      $set: {
        visibility: 'private',
        importCount: 0,
        rating: 0,
        tags: [],
        isApproved: false,
      },
    }
  );

  // Create indexes for marketplace
  await db
    .collection('encountertemplates')
    .createIndex(
      { visibility: 1, isApproved: 1 },
      { background: true, name: 'visibility_1_isApproved_1' }
    );
  await db
    .collection('encountertemplates')
    .createIndex({ tags: 1 }, { background: true, name: 'tags_1' });
  await db
    .collection('encountertemplates')
    .createIndex({ rating: -1 }, { background: true, name: 'rating_-1' });
}

export async function down(db: Db): Promise<void> {
  await db.collection('encountertemplates').updateMany(
    {},
    {
      $unset: {
        visibility: '',
        importCount: '',
        rating: '',
        tags: '',
        isApproved: '',
        publishedAt: '',
        publishedBy: '',
        approvedBy: '',
      },
    }
  );

  await db
    .collection('encountertemplates')
    .dropIndex('visibility_1_isApproved_1')
    .catch(() => {});
  await db
    .collection('encountertemplates')
    .dropIndex('tags_1')
    .catch(() => {});
  await db
    .collection('encountertemplates')
    .dropIndex('rating_-1')
    .catch(() => {});
}
