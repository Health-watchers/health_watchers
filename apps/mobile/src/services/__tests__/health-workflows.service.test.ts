import { HealthWorkflowsService } from '../health-workflows.service';
import { authService } from '../auth.service';

jest.mock('../auth.service');

const mockAuthService = authService as jest.Mocked<typeof authService>;

describe('HealthWorkflowsService', () => {
  let mockApiClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient = {
      get: jest.fn(),
      post: jest.fn(),
    };
    mockAuthService.getApiClient.mockReturnValue(mockApiClient);
  });

  describe('listDocuments', () => {
    it('fetches and normalizes document records', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              _id: '1',
              fileName: 'Lab Report.pdf',
              documentType: 'lab-result',
              createdAt: '2024-01-15T10:00:00Z',
              url: 'https://example.com/doc1.pdf',
            },
            {
              _id: '2',
              name: 'Prescription',
              type: 'prescription',
              uploadedAt: '2024-01-16T10:00:00Z',
            },
          ],
        },
      };

      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await HealthWorkflowsService.listDocuments();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: '1',
        name: 'Lab Report.pdf',
        type: 'lab-result',
        uploadedAt: '2024-01-15T10:00:00Z',
      });
      expect(result[1]).toMatchObject({
        id: '2',
        name: 'Prescription',
        type: 'prescription',
      });
    });

    it('returns empty array on API error', async () => {
      mockApiClient.get.mockRejectedValue(new Error('Network error'));

      const result = await HealthWorkflowsService.listDocuments();

      expect(result).toEqual([]);
    });
  });

  describe('listCarePlans', () => {
    it('fetches and normalizes care plan records', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              _id: '1',
              title: 'Diabetes Management',
              goals: [{ description: 'Control blood sugar' }],
              interventions: [{ description: 'Daily medication' }],
              status: 'active',
            },
            {
              _id: '2',
              condition: 'Hypertension',
              goal: 'Lower blood pressure',
              intervention: 'Exercise and diet',
              progress: 50,
            },
          ],
        },
      };

      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await HealthWorkflowsService.listCarePlans();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: '1',
        title: 'Diabetes Management',
        goal: 'Control blood sugar',
        intervention: 'Daily medication',
        progress: 0,
      });
      expect(result[1]).toMatchObject({
        id: '2',
        title: 'Hypertension',
        goal: 'Lower blood pressure',
        intervention: 'Exercise and diet',
        progress: 50,
      });
    });

    it('returns empty array on API error', async () => {
      mockApiClient.get.mockRejectedValue(new Error('Network error'));

      const result = await HealthWorkflowsService.listCarePlans();

      expect(result).toEqual([]);
    });
  });

  describe('listImmunizations', () => {
    it('fetches and normalizes immunization records', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              _id: '1',
              vaccineName: 'COVID-19',
              administeredDate: '2024-01-10T10:00:00Z',
            },
            {
              _id: '2',
              vaccine: 'Flu Shot',
              dueDate: '2024-12-01T00:00:00Z',
            },
          ],
        },
      };

      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await HealthWorkflowsService.listImmunizations();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: '1',
        vaccine: 'COVID-19',
        administeredAt: '2024-01-10T10:00:00Z',
      });
      expect(result[1]).toMatchObject({
        id: '2',
        vaccine: 'Flu Shot',
        dueDate: '2024-12-01T00:00:00Z',
      });
    });

    it('returns empty array on API error', async () => {
      mockApiClient.get.mockRejectedValue(new Error('Network error'));

      const result = await HealthWorkflowsService.listImmunizations();

      expect(result).toEqual([]);
    });
  });

  describe('saveDocument', () => {
    it('posts document to API and returns normalized result', async () => {
      const document = {
        id: '1',
        name: 'Test Document',
        type: 'other',
        uploadedAt: '2024-01-15T10:00:00Z',
      };

      const mockResponse = {
        data: {
          data: { _id: '1', ...document },
        },
      };

      mockApiClient.post.mockResolvedValue(mockResponse);

      const result = await HealthWorkflowsService.saveDocument(document);

      expect(mockApiClient.post).toHaveBeenCalledWith('/documents', document);
      expect(result).toMatchObject(document);
    });
  });

  describe('saveCarePlan', () => {
    it('posts care plan to API', async () => {
      const carePlan = {
        id: '1',
        title: 'Test Plan',
        goal: 'Test goal',
        intervention: 'Test intervention',
        assignee: 'Dr. Smith',
        progress: 50,
        history: [],
      };

      const mockResponse = {
        data: {
          data: { _id: '1', ...carePlan },
        },
      };

      mockApiClient.post.mockResolvedValue(mockResponse);

      const result = await HealthWorkflowsService.saveCarePlan(carePlan);

      expect(mockApiClient.post).toHaveBeenCalledWith('/care-plans', carePlan);
      expect(result).toMatchObject(carePlan);
    });
  });

  describe('saveImmunization', () => {
    it('posts immunization record to API', async () => {
      const immunization = {
        id: '1',
        vaccine: 'Flu Shot',
        dueDate: '2024-12-01T00:00:00Z',
      };

      const mockResponse = {
        data: {
          data: { _id: '1', ...immunization },
        },
      };

      mockApiClient.post.mockResolvedValue(mockResponse);

      const result = await HealthWorkflowsService.saveImmunization(immunization);

      expect(mockApiClient.post).toHaveBeenCalledWith('/immunizations', immunization);
      expect(result).toMatchObject(immunization);
    });
  });
});
