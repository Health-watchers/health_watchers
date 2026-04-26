import { anonymize, anonymizeBatch, createAuditLog, type PatientData } from './index';

describe('Anonymization Service', () => {
  const mockPatient: PatientData = {
    firstName: 'John',
    lastName: 'Doe',
    dateOfBirth: '1980-05-15',
    contactNumber: '555-123-4567',
    address: '123 Main Street, Springfield, IL',
    email: 'john.doe@example.com',
    systemId: 'PAT-12345',
    clinicalNotes: 'Patient John Doe presented on January 15, 2024 with complaints. Contact: 555-123-4567',
    sex: 'M',
  };

  describe('Level 1: De-identification', () => {
    it('should remove direct identifiers', () => {
      const result = anonymize(mockPatient, { level: 'de-identification' });
      
      expect(result.firstName).toBeUndefined();
      expect(result.lastName).toBeUndefined();
      expect(result.contactNumber).toBe('[REDACTED]');
      expect(result.email).toBe('[REDACTED]');
      expect(result.systemId).toBe('[REDACTED]');
    });

    it('should convert DOB to age range', () => {
      const result = anonymize(mockPatient, { level: 'de-identification' });
      
      expect(result.dateOfBirth).toMatch(/\d+-\d+ years/);
    });

    it('should extract city/region from address', () => {
      const result = anonymize(mockPatient, { level: 'de-identification' });
      
      expect(result.address).toBe('Springfield, IL');
      expect(result.address).not.toContain('123 Main Street');
    });

    it('should strip PII from clinical notes', () => {
      const result = anonymize(mockPatient, { level: 'de-identification' });
      
      expect(result.clinicalNotes).not.toContain('John Doe');
      expect(result.clinicalNotes).toContain('the patient');
      expect(result.clinicalNotes).not.toContain('555-123-4567');
      expect(result.clinicalNotes).toContain('[PHONE]');
    });

    it('should not contain any PII in output', () => {
      const result = anonymize(mockPatient, { level: 'de-identification' });
      const resultStr = JSON.stringify(result);
      
      expect(resultStr).not.toContain('John');
      expect(resultStr).not.toContain('Doe');
      expect(resultStr).not.toContain('555-123-4567');
      expect(resultStr).not.toContain('john.doe@example.com');
      expect(resultStr).not.toContain('PAT-12345');
    });
  });

  describe('Level 2: Pseudonymization', () => {
    it('should replace names with consistent pseudonyms', () => {
      const result = anonymize(mockPatient, { 
        level: 'pseudonymization',
        sessionId: 'session-123'
      });
      
      expect(result.firstName).toBe('Patient');
      expect(result.lastName).toMatch(/^[a-f0-9]{8}$/);
    });

    it('should generate consistent pseudonyms for same session', () => {
      const result1 = anonymize(mockPatient, { 
        level: 'pseudonymization',
        sessionId: 'session-123'
      });
      const result2 = anonymize(mockPatient, { 
        level: 'pseudonymization',
        sessionId: 'session-123'
      });
      
      expect(result1.lastName).toBe(result2.lastName);
      expect(result1.systemId).toBe(result2.systemId);
    });

    it('should generate different pseudonyms for different sessions', () => {
      const result1 = anonymize(mockPatient, { 
        level: 'pseudonymization',
        sessionId: 'session-123'
      });
      const result2 = anonymize(mockPatient, { 
        level: 'pseudonymization',
        sessionId: 'session-456'
      });
      
      expect(result1.lastName).not.toBe(result2.lastName);
    });

    it('should anonymize systemId with prefix', () => {
      const result = anonymize(mockPatient, { 
        level: 'pseudonymization',
        sessionId: 'session-123'
      });
      
      expect(result.systemId).toMatch(/^ANON_[a-f0-9]{8}$/);
    });
  });

  describe('Level 3: Aggregation', () => {
    const mockPatients: PatientData[] = [
      { ...mockPatient, dateOfBirth: '1980-05-15', sex: 'M' },
      { ...mockPatient, dateOfBirth: '1985-08-20', sex: 'F' },
      { ...mockPatient, dateOfBirth: '1982-03-10', sex: 'M' },
      { ...mockPatient, dateOfBirth: '1990-12-05', sex: 'F' },
    ];

    it('should return aggregate statistics only', () => {
      const result = anonymizeBatch(mockPatients, { level: 'aggregation' });
      
      expect(result).toHaveProperty('totalRecords');
      expect(result).toHaveProperty('ageRanges');
      expect(result).toHaveProperty('sexDistribution');
      expect(Array.isArray(result)).toBe(false);
    });

    it('should count records correctly', () => {
      const result = anonymizeBatch(mockPatients, { level: 'aggregation' });
      
      expect((result as any).totalRecords).toBe(4);
    });

    it('should aggregate age ranges', () => {
      const result = anonymizeBatch(mockPatients, { level: 'aggregation' }) as any;
      
      expect(result.ageRanges).toBeDefined();
      expect(Object.keys(result.ageRanges).length).toBeGreaterThan(0);
    });

    it('should aggregate sex distribution', () => {
      const result = anonymizeBatch(mockPatients, { level: 'aggregation' }) as any;
      
      expect(result.sexDistribution).toEqual({ M: 2, F: 2 });
    });

    it('should not contain individual records', () => {
      const result = anonymizeBatch(mockPatients, { level: 'aggregation' });
      const resultStr = JSON.stringify(result);
      
      expect(resultStr).not.toContain('John');
      expect(resultStr).not.toContain('Doe');
      expect(resultStr).not.toContain('PAT-12345');
    });
  });

  describe('Clinical Notes Anonymization', () => {
    it('should replace patient names with "the patient"', () => {
      const notes = 'John Doe presented with symptoms. John reported pain.';
      const patient = { ...mockPatient, clinicalNotes: notes };
      const result = anonymize(patient, { level: 'de-identification' });
      
      expect(result.clinicalNotes).toContain('the patient');
      expect(result.clinicalNotes).not.toContain('John Doe');
    });

    it('should redact phone numbers', () => {
      const notes = 'Contact patient at 555-123-4567 or 555.987.6543';
      const patient = { ...mockPatient, clinicalNotes: notes };
      const result = anonymize(patient, { level: 'de-identification' });
      
      expect(result.clinicalNotes).not.toContain('555-123-4567');
      expect(result.clinicalNotes).not.toContain('555.987.6543');
      expect(result.clinicalNotes).toContain('[PHONE]');
    });

    it('should redact email addresses', () => {
      const notes = 'Email: john.doe@example.com for follow-up';
      const patient = { ...mockPatient, clinicalNotes: notes };
      const result = anonymize(patient, { level: 'de-identification' });
      
      expect(result.clinicalNotes).not.toContain('john.doe@example.com');
      expect(result.clinicalNotes).toContain('[EMAIL]');
    });

    it('should redact addresses', () => {
      const notes = 'Patient lives at 123 Main Street';
      const patient = { ...mockPatient, clinicalNotes: notes };
      const result = anonymize(patient, { level: 'de-identification' });
      
      expect(result.clinicalNotes).toContain('[ADDRESS]');
    });

    it('should not break clinical meaning', () => {
      const notes = 'Patient presented with acute chest pain. Diagnosis: myocardial infarction.';
      const patient = { ...mockPatient, clinicalNotes: notes };
      const result = anonymize(patient, { level: 'de-identification' });
      
      expect(result.clinicalNotes).toContain('chest pain');
      expect(result.clinicalNotes).toContain('myocardial infarction');
    });
  });

  describe('Audit Logging', () => {
    it('should create audit log entry', () => {
      const log = createAuditLog(
        ['firstName', 'lastName', 'dateOfBirth'],
        'AI processing',
        'user-123',
        'de-identification',
        1
      );
      
      expect(log.dataAnonymized).toEqual(['firstName', 'lastName', 'dateOfBirth']);
      expect(log.purpose).toBe('AI processing');
      expect(log.requestedBy).toBe('user-123');
      expect(log.level).toBe('de-identification');
      expect(log.recordCount).toBe(1);
      expect(log.timestamp).toBeInstanceOf(Date);
    });
  });
});
