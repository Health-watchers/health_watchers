import { Db } from 'mongodb';

export const up = async (db: Db) => {
  // Add MFA fields to User collection for portal patients
  await db.collection('users').updateMany(
    { role: 'PATIENT' },
    {
      $set: {
        portalMfaEnabled: false,
        portalMfaSecret: undefined,
        portalMfaBackupCodes: undefined,
        portalMfaMethod: undefined, // 'totp' or 'sms'
        portalPhoneNumber: undefined,
        portalMfaEnabledAt: undefined,
      },
    }
  );

  // Create index for faster lookups
  await db.collection('users').createIndex({ email: 1, role: 1 });
};

export const down = async (db: Db) => {
  // Remove MFA fields from User collection
  await db.collection('users').updateMany(
    { role: 'PATIENT' },
    {
      $unset: {
        portalMfaEnabled: '',
        portalMfaSecret: '',
        portalMfaBackupCodes: '',
        portalMfaMethod: '',
        portalPhoneNumber: '',
        portalMfaEnabledAt: '',
      },
    }
  );
};
