import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  // Create index for efficient overdue immunization queries
  await db
    .collection('immunizations')
    .createIndex(
      { patientId: 1, vaccineCode: 1, administeredDate: -1 },
      { background: true, name: 'patientId_1_vaccineCode_1_administeredDate_-1' }
    );

  // Create index for clinic-wide compliance queries
  await db
    .collection('immunizations')
    .createIndex(
      { clinicId: 1, administeredDate: -1 },
      { background: true, name: 'clinicId_1_administeredDate_-1' }
    );
}

export async function down(db: Db): Promise<void> {
  // Drop indexes
  await db
    .collection('immunizations')
    .dropIndex('patientId_1_vaccineCode_1_administeredDate_-1')
    .catch(() => {});
  await db
    .collection('immunizations')
    .dropIndex('clinicId_1_administeredDate_-1')
    .catch(() => {});
}
