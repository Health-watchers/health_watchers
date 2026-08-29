import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { scopeGrantsAccess, PREDEFINED_SCOPES } from '../constants/scopes';

describe('API Key Scope Validation', () => {
  describe('scopeGrantsAccess', () => {
    describe('Patient Scopes', () => {
      it('should grant patients:read access to GET /api/v1/patients', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.PATIENTS_READ,
          '/api/v1/patients',
          'GET'
        );
        expect(result).toBe(true);
      });

      it('should grant patients:read access to GET /api/v1/patients/:id', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.PATIENTS_READ,
          '/api/v1/patients/123',
          'GET'
        );
        expect(result).toBe(true);
      });

      it('should deny patients:read access to POST /api/v1/patients', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.PATIENTS_READ,
          '/api/v1/patients',
          'POST'
        );
        expect(result).toBe(false);
      });

      it('should grant patients:write access to POST /api/v1/patients', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.PATIENTS_WRITE,
          '/api/v1/patients',
          'POST'
        );
        expect(result).toBe(true);
      });

      it('should deny patients:write access to GET /api/v1/patients', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.PATIENTS_WRITE,
          '/api/v1/patients',
          'GET'
        );
        expect(result).toBe(false);
      });

      it('should grant patients:delete access to DELETE /api/v1/patients/:id', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.PATIENTS_DELETE,
          '/api/v1/patients/123',
          'DELETE'
        );
        expect(result).toBe(true);
      });

      it('should deny patients:delete access to DELETE /api/v1/patients', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.PATIENTS_DELETE,
          '/api/v1/patients',
          'DELETE'
        );
        expect(result).toBe(false);
      });
    });

    describe('Encounter Scopes', () => {
      it('should grant encounters:read access to GET /api/v1/encounters', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.ENCOUNTERS_READ,
          '/api/v1/encounters',
          'GET'
        );
        expect(result).toBe(true);
      });

      it('should grant encounters:write access to POST /api/v1/encounters', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.ENCOUNTERS_WRITE,
          '/api/v1/encounters',
          'POST'
        );
        expect(result).toBe(true);
      });

      it('should grant encounters:delete access to DELETE /api/v1/encounters/:id', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.ENCOUNTERS_DELETE,
          '/api/v1/encounters/456',
          'DELETE'
        );
        expect(result).toBe(true);
      });
    });

    describe('Payment Scopes', () => {
      it('should grant payments:read access to GET /api/v1/payments', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.PAYMENTS_READ,
          '/api/v1/payments',
          'GET'
        );
        expect(result).toBe(true);
      });

      it('should grant payments:write access to POST /api/v1/payments', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.PAYMENTS_WRITE,
          '/api/v1/payments',
          'POST'
        );
        expect(result).toBe(true);
      });

      it('should grant payments:confirm access to POST /api/v1/payments/:id/confirm', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.PAYMENTS_CONFIRM,
          '/api/v1/payments/789/confirm',
          'POST'
        );
        expect(result).toBe(true);
      });

      it('should deny payments:confirm access to POST /api/v1/payments', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.PAYMENTS_CONFIRM,
          '/api/v1/payments',
          'POST'
        );
        expect(result).toBe(false);
      });
    });

    describe('AI Scopes', () => {
      it('should grant ai:read access to GET /api/v1/ai', () => {
        const result = scopeGrantsAccess(PREDEFINED_SCOPES.AI_READ, '/api/v1/ai', 'GET');
        expect(result).toBe(true);
      });

      it('should grant ai:write access to POST /api/v1/ai', () => {
        const result = scopeGrantsAccess(PREDEFINED_SCOPES.AI_WRITE, '/api/v1/ai', 'POST');
        expect(result).toBe(true);
      });
    });

    describe('API Keys Management Scopes', () => {
      it('should grant api-keys:manage access to POST /api/v1/api-keys', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.API_KEYS_MANAGE,
          '/api/v1/api-keys',
          'POST'
        );
        expect(result).toBe(true);
      });

      it('should grant api-keys:manage access to PATCH /api/v1/api-keys/:id', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.API_KEYS_MANAGE,
          '/api/v1/api-keys/key123',
          'PATCH'
        );
        expect(result).toBe(true);
      });

      it('should grant api-keys:read access to GET /api/v1/api-keys', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.API_KEYS_READ,
          '/api/v1/api-keys',
          'GET'
        );
        expect(result).toBe(true);
      });

      it('should deny api-keys:read access to POST /api/v1/api-keys', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.API_KEYS_READ,
          '/api/v1/api-keys',
          'POST'
        );
        expect(result).toBe(false);
      });
    });

    describe('HTTP Method Validation', () => {
      it('should treat HEAD as read operation', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.PATIENTS_READ,
          '/api/v1/patients',
          'HEAD'
        );
        expect(result).toBe(true);
      });

      it('should treat PUT as write operation', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.PATIENTS_WRITE,
          '/api/v1/patients',
          'PUT'
        );
        expect(result).toBe(true);
      });

      it('should treat PATCH as write operation', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.PATIENTS_WRITE,
          '/api/v1/patients',
          'PATCH'
        );
        expect(result).toBe(true);
      });
    });

    describe('Cross-Scope Denial', () => {
      it('should deny patients scope access to encounters endpoint', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.PATIENTS_READ,
          '/api/v1/encounters',
          'GET'
        );
        expect(result).toBe(false);
      });

      it('should deny encounters scope access to payments endpoint', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.ENCOUNTERS_READ,
          '/api/v1/payments',
          'GET'
        );
        expect(result).toBe(false);
      });

      it('should deny payments scope access to patients endpoint', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.PAYMENTS_READ,
          '/api/v1/patients',
          'GET'
        );
        expect(result).toBe(false);
      });
    });

    describe('Case Insensitivity', () => {
      it('should handle lowercase endpoints', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.PATIENTS_READ,
          '/api/v1/patients',
          'GET'
        );
        expect(result).toBe(true);
      });

      it('should handle uppercase endpoints', () => {
        const result = scopeGrantsAccess(
          PREDEFINED_SCOPES.PATIENTS_READ,
          '/API/V1/PATIENTS',
          'GET'
        );
        expect(result).toBe(true);
      });
    });
  });
});
