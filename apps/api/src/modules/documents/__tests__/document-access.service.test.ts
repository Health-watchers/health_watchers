/**
 * Document access-control evaluation — Issue #1247
 */
import { Types } from 'mongoose';

// The grant lookup is exercised separately; default it to "no grant".
jest.mock('../models/document-access-grant.model', () => ({
  DocumentAccessGrantModel: {
    findOne: () => ({ select: () => ({ lean: async () => null }) }),
    find: () => ({ select: () => ({ lean: async () => [] }) }),
  },
}));

import { evaluateAccess, type AccessSubject } from '../document-access.service';

const CLINIC = new Types.ObjectId().toString();
const OWNER = new Types.ObjectId().toString();
const OTHER_USER = new Types.ObjectId().toString();
const DOC_ID = new Types.ObjectId().toString();

function doc(over: Record<string, unknown> = {}) {
  return {
    _id: DOC_ID,
    clinicId: CLINIC,
    uploadedBy: OWNER,
    accessLevel: 'clinic',
    status: 'active',
    ...over,
  } as never;
}

const nurse: AccessSubject = { userId: OTHER_USER, role: 'NURSE', clinicId: CLINIC };
const admin: AccessSubject = {
  userId: new Types.ObjectId().toString(),
  role: 'CLINIC_ADMIN',
  clinicId: CLINIC,
};
const owner: AccessSubject = { userId: OWNER, role: 'NURSE', clinicId: CLINIC };

describe('evaluateAccess', () => {
  it('denies cross-clinic access outright', async () => {
    const d = await evaluateAccess({ ...nurse, clinicId: new Types.ObjectId().toString() }, doc());
    expect(d.allowed).toBe(false);
    expect(d.via).toBe('denied');
  });

  it('allows any same-clinic user to read a clinic-wide document', async () => {
    const d = await evaluateAccess(nurse, doc({ accessLevel: 'clinic' }), 'read');
    expect(d.allowed).toBe(true);
    expect(d.via).toBe('clinic');
  });

  it('does not allow a plain clinic user to WRITE a clinic-wide document', async () => {
    const d = await evaluateAccess(nurse, doc({ accessLevel: 'clinic' }), 'write');
    expect(d.allowed).toBe(false);
  });

  it('always allows the owner', async () => {
    const d = await evaluateAccess(owner, doc({ accessLevel: 'private' }), 'write');
    expect(d.allowed).toBe(true);
    expect(d.via).toBe('owner');
  });

  it('always allows a clinic admin to read', async () => {
    const d = await evaluateAccess(admin, doc({ accessLevel: 'private' }), 'read');
    expect(d.allowed).toBe(true);
    expect(d.via).toBe('admin');
  });

  it('restricted: allows a role on the allow-list', async () => {
    const d = await evaluateAccess(
      nurse,
      doc({ accessLevel: 'restricted', allowedRoles: ['NURSE'] }),
      'read'
    );
    expect(d.allowed).toBe(true);
    expect(d.via).toBe('role');
  });

  it('restricted: allows a user on the allow-list', async () => {
    const d = await evaluateAccess(
      nurse,
      doc({ accessLevel: 'restricted', allowedUserIds: [OTHER_USER] }),
      'read'
    );
    expect(d.allowed).toBe(true);
    expect(d.via).toBe('allowlist');
  });

  it('restricted: denies a user with neither role nor grant', async () => {
    const d = await evaluateAccess(nurse, doc({ accessLevel: 'restricted' }), 'read');
    expect(d.allowed).toBe(false);
  });

  it('denies access to an expired document for non-admins', async () => {
    const d = await evaluateAccess(
      nurse,
      doc({ accessLevel: 'clinic', status: 'expired' }),
      'read'
    );
    expect(d.allowed).toBe(false);
  });

  it('lets an admin still read an expired document', async () => {
    const d = await evaluateAccess(
      admin,
      doc({ accessLevel: 'clinic', status: 'expired' }),
      'read'
    );
    expect(d.allowed).toBe(true);
  });

  it('treats a past expiresAt like an expired status', async () => {
    const d = await evaluateAccess(
      nurse,
      doc({ accessLevel: 'clinic', expiresAt: new Date(Date.now() - 1000) }),
      'read'
    );
    expect(d.allowed).toBe(false);
  });
});
