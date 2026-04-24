import { AuditLogModel } from './audit.model';
import { auditLog } from './audit.service';

describe('Audit Logging', () => {
  describe('AuditLogModel', () => {
    it('should prevent updates to audit logs', async () => {
      const log = await AuditLogModel.create({
        action: 'LOGIN_SUCCESS',
        outcome: 'SUCCESS',
        timestamp: new Date(),
      });

      await expect(
        AuditLogModel.updateOne({ _id: log._id }, { action: 'LOGIN_FAILURE' })
      ).rejects.toThrow('Audit logs are immutable and cannot be updated');
    });

    it('should prevent deletion of audit logs', async () => {
      const log = await AuditLogModel.create({
        action: 'LOGIN_SUCCESS',
        outcome: 'SUCCESS',
        timestamp: new Date(),
      });

      await expect(AuditLogModel.deleteOne({ _id: log._id })).rejects.toThrow(
        'Audit logs are immutable and cannot be deleted'
      );
    });
  });

  describe('auditLog function', () => {
    it('should create audit log with all fields', async () => {
      const mockReq = {
        headers: {
          'user-agent': 'test-agent',
          'x-forwarded-for': '192.168.1.1',
        },
        socket: { remoteAddress: '127.0.0.1' },
      } as any;

      await auditLog(
        {
          action: 'PATIENT_VIEW',
          resourceType: 'Patient',
          resourceId: 'patient-123',
          userId: 'user-123',
          clinicId: 'clinic-123',
          outcome: 'SUCCESS',
        },
        mockReq
      );

      const logs = await AuditLogModel.find({ resourceId: 'patient-123' });
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('PATIENT_VIEW');
      expect(logs[0].ipAddress).toBe('192.168.1.1');
      expect(logs[0].userAgent).toBe('test-agent');
    });

    it('should not throw error if audit logging fails', async () => {
      // This should not throw even with invalid data
      await expect(auditLog({ action: 'INVALID_ACTION' as any }, undefined)).resolves.not.toThrow();
    });
  });
});
