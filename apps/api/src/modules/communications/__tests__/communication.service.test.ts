import { CommunicationService } from '../communication.service';
import { CommunicationLogModel } from '../communication-log.model';
import { PatientModel } from '../../patients/models/patient.model';
import { auditLog } from '../../audit/audit.service';
import { paginate } from '../../../utils/paginate';

jest.mock('../communication-log.model', () => ({ CommunicationLogModel: { create: jest.fn() } }));
jest.mock('../../patients/models/patient.model', () => ({ PatientModel: { findOne: jest.fn() } }));
jest.mock('../../audit/audit.service', () => ({ auditLog: jest.fn() }));
jest.mock('../../../utils/paginate', () => ({ paginate: jest.fn() }));

describe('CommunicationService', () => {
  let service: CommunicationService;
  const user = { _id: 'u1', clinicId: 'c1' };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CommunicationService();
  });

  describe('logCommunication', () => {
    it('throws when the patient does not exist in the clinic', async () => {
      (PatientModel.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.logCommunication('p1', {} as any, user)).rejects.toThrow(
        'Patient not found'
      );

      expect(CommunicationLogModel.create).not.toHaveBeenCalled();
    });

    it('creates a communication log and writes an audit entry', async () => {
      (PatientModel.findOne as jest.Mock).mockResolvedValue({ _id: 'p1' });
      (CommunicationLogModel.create as jest.Mock).mockResolvedValue({
        _id: { toString: () => 'log1' },
      });

      const params = {
        channel: 'sms',
        direction: 'outbound',
        content: 'hi',
        status: 'sent',
        sentAt: new Date('2026-01-01'),
      } as any;

      const result = await service.logCommunication('p1', params, user);

      expect(CommunicationLogModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ patientId: 'p1', clinicId: 'c1', sentBy: 'u1', content: 'hi' })
      );
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'COMMUNICATION_LOG_CREATED', resourceId: 'log1' })
      );
      expect(result).toEqual({ _id: { toString: expect.any(Function) } });
    });
  });

  describe('listCommunications', () => {
    it('throws when the patient does not exist in the clinic', async () => {
      (PatientModel.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.listCommunications('p1', 'c1', { page: 1, limit: 20 } as any)
      ).rejects.toThrow('Patient not found');
    });

    it('paginates results filtered by channel/direction and audits the view', async () => {
      (PatientModel.findOne as jest.Mock).mockResolvedValue({ _id: 'p1' });
      (paginate as jest.Mock).mockResolvedValue({
        data: [{ id: 1 }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
      });

      const result = await service.listCommunications('p1', 'c1', {
        page: 1,
        limit: 20,
        channel: 'sms',
        direction: 'outbound',
      } as any);

      expect(paginate).toHaveBeenCalledWith(
        CommunicationLogModel,
        { patientId: 'p1', clinicId: 'c1', channel: 'sms', direction: 'outbound' },
        1,
        20,
        { sentAt: -1 }
      );
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'COMMUNICATION_LOG_VIEWED' })
      );
      expect(result.data).toEqual([{ id: 1 }]);
      expect(result.meta.total).toBe(1);
    });
  });
});
