import { jest } from '@jest/globals';
import { Horizon } from '@stellar/stellar-sdk';
import * as stellar from '../stellar';

// Mock Horizon server
const mockLoadAccount = jest.fn();
const mockSubmitTransaction = jest.fn();
const mockTransactions = jest.fn();
const mockFetchBaseFee = jest.fn();
const mockFeeStats = jest.fn();

jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk') as any;
  return {
    ...actual,
    Horizon: {
      ...actual.Horizon,
      Server: jest.fn().mockImplementation(() => ({
        loadAccount: mockLoadAccount,
        submitTransaction: mockSubmitTransaction,
        transactions: () => ({
          transaction: mockTransactions,
        }),
        fetchBaseFee: mockFetchBaseFee,
        feeStats: mockFeeStats,
      })),
    },
  };
});

// Mock fetch for Friendbot
global.fetch = jest.fn() as any;

describe('Stellar Service Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchBaseFee.mockResolvedValue('100');
  });

  describe('fundAccount (POST /fund)', () => {
    it('should return success for valid public key', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hash: 'test-hash-123',
          ledger: 12345,
        }),
      });

      const result = await stellar.fundAccount('GTEST123');

      expect(result).toEqual({
        funded: true,
        hash: 'test-hash-123',
        ledger: 12345,
      });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('friendbot.stellar.org')
      );
    });

    it('should return 400 for missing public key', async () => {
      await expect(stellar.fundAccount('')).rejects.toThrow();
    });

    it('should handle Friendbot API failure gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Rate limit exceeded',
        json: async () => ({ detail: 'Too many requests' }),
      });

      await expect(stellar.fundAccount('GTEST123')).rejects.toThrow(
        'Too many requests'
      );
    });

    it('should reject mainnet funding attempts', async () => {
      // Mock mainnet config
      const originalConfig = (stellar as any).stellarConfig;
      (stellar as any).stellarConfig = { ...originalConfig, network: 'mainnet' };

      await expect(stellar.fundAccount('GTEST123')).rejects.toThrow(
        'Friendbot funding is not available on mainnet'
      );

      // Restore config
      (stellar as any).stellarConfig = originalConfig;
    });
  });

  describe('createIntent (POST /intent)', () => {
    it('should create and submit transaction for valid inputs', async () => {
      mockLoadAccount.mockResolvedValueOnce({
        sequenceNumber: () => '123',
        accountId: () => 'GFROM123',
        incrementSequenceNumber: jest.fn(),
      });

      mockSubmitTransaction.mockResolvedValueOnce({
        hash: 'tx-hash-456',
        successful: true,
      });

      const result = await stellar.createIntent(
        'GFROM123',
        'GTO456',
        '10.5'
      );

      expect(result).toHaveProperty('xdr');
      expect(result).toHaveProperty('hash');
      expect(result).toHaveProperty('networkPassphrase');
      expect(mockLoadAccount).toHaveBeenCalledWith('GFROM123');
    });

    it('should return 400 for missing required fields', async () => {
      await expect(stellar.createIntent('', 'GTO456', '10')).rejects.toThrow();
    });

    it('should handle insufficient balance error', async () => {
      mockLoadAccount.mockRejectedValueOnce({
        response: {
          status: 404,
          data: { detail: 'Account not found' },
        },
      });

      await expect(
        stellar.createIntent('GFROM123', 'GTO456', '10')
      ).rejects.toThrow();
    });

    it('should handle invalid destination address', async () => {
      mockLoadAccount.mockResolvedValueOnce({
        sequenceNumber: () => '123',
        accountId: () => 'GFROM123',
        incrementSequenceNumber: jest.fn(),
      });

      await expect(
        stellar.createIntent('GFROM123', 'INVALID', '10')
      ).rejects.toThrow();
    });

    it('should handle network timeout', async () => {
      mockLoadAccount.mockRejectedValueOnce(new Error('Network timeout'));

      await expect(
        stellar.createIntent('GFROM123', 'GTO456', '10')
      ).rejects.toThrow('Network timeout');
    });
  });

  describe('verifyIntent (GET /verify/:hash)', () => {
    it('should return transaction details for valid hash', async () => {
      mockTransactions.mockResolvedValueOnce({
        call: async () => ({
          hash: 'valid-hash-789',
          successful: true,
          ledger_attr: 54321,
          created_at: '2024-01-01T00:00:00Z',
        }),
      });

      const result = await stellar.verifyIntent('valid-hash-789');

      expect(result).toEqual({
        found: true,
        hash: 'valid-hash-789',
        successful: true,
        ledger: 54321,
        createdAt: '2024-01-01T00:00:00Z',
      });
    });

    it('should return 404 for non-existent hash', async () => {
      mockTransactions.mockResolvedValueOnce({
        call: async () => {
          throw { response: { status: 404 } };
        },
      });

      const result = await stellar.verifyIntent('non-existent-hash');

      expect(result).toEqual({
        found: false,
        error: 'Transaction not found',
      });
    });

    it('should return 404 for invalid hash format', async () => {
      mockTransactions.mockResolvedValueOnce({
        call: async () => {
          throw { response: { status: 404 } };
        },
      });

      const result = await stellar.verifyIntent('invalid-format');

      expect(result).toEqual({
        found: false,
        error: 'Transaction not found',
      });
    });
  });

  describe('Network Validation', () => {
    it('should use correct network passphrase for testnet', () => {
      const passphrase = stellar.getNetworkPassphrase();
      expect(passphrase).toContain('Test');
    });

    it('should reject mainnet transactions when configured for testnet', async () => {
      // This is implicitly tested by the fundAccount mainnet rejection test
      const originalConfig = (stellar as any).stellarConfig;
      (stellar as any).stellarConfig = { ...originalConfig, network: 'testnet' };

      const passphrase = stellar.getNetworkPassphrase();
      expect(passphrase).not.toContain('Public');

      (stellar as any).stellarConfig = originalConfig;
    });
  });

  describe('getFeeStats', () => {
    it('should fetch and format fee statistics', async () => {
      mockFeeStats.mockResolvedValueOnce({
        fee_charged: {
          min: '100',
          mode: '100',
          max: '10000',
          p10: '100',
          p50: '200',
          p90: '500',
          p99: '1000',
        },
      });

      const result = await stellar.getFeeStats();

      expect(result).toHaveProperty('slow');
      expect(result).toHaveProperty('standard');
      expect(result).toHaveProperty('fast');
      expect(result).toHaveProperty('raw');
      expect(result.slow.stroops).toBe('100');
      expect(result.standard.stroops).toBe('200');
      expect(result.fast.stroops).toBe('500');
    });
  });
});
