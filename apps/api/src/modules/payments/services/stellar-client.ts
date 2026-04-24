import axios, { AxiosInstance } from 'axios';
import { config } from '@health-watchers/config';

/**
 * Stellar Service Client
 *
 * Communicates with the stellar-service to verify on-chain transactions.
 * The stellar-service runs as a separate microservice.
 */

export interface StellarTransaction {
  hash: string;
  from: string;
  to: string;
  amount: string;
  asset: string;
  memo?: string;
  timestamp: string;
  success: boolean;
}

export interface VerifyTransactionResponse {
  found: boolean;
  transaction?: StellarTransaction;
  error?: string;
}

class StellarClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.stellarServiceUrl;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Verify a transaction by its hash
   * Calls the stellar-service GET /verify/:hash endpoint
   */
  async verifyTransaction(txHash: string): Promise<VerifyTransactionResponse> {
    try {
      const response = await this.client.get(`/verify/${txHash}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          return { found: false, error: 'Transaction not found' };
        }
        if (error.response?.status === 500) {
          return {
            found: false,
            error: error.response.data?.error || 'Stellar service error',
          };
        }
        return { found: false, error: `Request failed: ${error.message}` };
      }
      return { found: false, error: 'Unknown error occurred' };
    }
  }

  /**
   * Get XLM and USDC balances and recent transactions for a public key
   * Calls the stellar-service GET /balance/:publicKey endpoint
   */
  async getBalance(
    publicKey: string
  ): Promise<{ balance: string; usdcBalance: string | null; transactions: unknown[] }> {
    const secret = process.env.STELLAR_SERVICE_SECRET;
    const response = await this.client.get(`/balance/${publicKey}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    return response.data;
  }

  /**
   * Create a USDC trustline for a clinic's Stellar account
   * Calls the stellar-service POST /trustline/usdc endpoint
   */
  async createUsdcTrustline(
    publicKey: string,
    usdcIssuer: string
  ): Promise<{ created?: boolean; alreadyExists?: boolean; hash?: string; dryRun?: boolean }> {
    const secret = process.env.STELLAR_SERVICE_SECRET;
    const response = await this.client.post(
      '/trustline/usdc',
      { publicKey, usdcIssuer },
      { headers: { Authorization: `Bearer ${secret}` } }
    );
    return response.data;
  }

  /**
   * Fund a testnet account via Friendbot
   * Calls the stellar-service POST /fund endpoint
   */
  async fundAccount(publicKey: string): Promise<{ funded: boolean; hash?: string }> {
    const secret = process.env.STELLAR_SERVICE_SECRET;
    const response = await this.client.post(
      '/fund',
      { publicKey },
      { headers: { Authorization: `Bearer ${secret}` } }
    );
    return response.data;
  }

  /**
   * Transfer all XLM from one account to another (used during keypair rotation)
   * Calls the stellar-service POST /transfer endpoint
   */
  async transferBalance(
    fromPublicKey: string,
    toPublicKey: string,
  ): Promise<{ transferred: boolean; amount?: string; hash?: string }> {
    const secret = process.env.STELLAR_SERVICE_SECRET;
    const response = await this.client.post(
      '/transfer',
      { fromPublicKey, toPublicKey },
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    return response.data;
  }

  /**
   * Get fee statistics from stellar-service
   * Calls GET /fee-stats (public endpoint)
   */
  async getFeeEstimate(): Promise<{
    slow: { stroops: string; xlm: string; confirmationTime: string };
    standard: { stroops: string; xlm: string; confirmationTime: string };
    fast: { stroops: string; xlm: string; confirmationTime: string };
    raw: Record<string, string>;
  }> {
    try {
      const response = await this.client.get('/fee-stats');
      const { success: _s, ...data } = response.data;
      return data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.message ?? `Fee stats unavailable: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Check if the stellar-service is healthy
   */
  async healthCheck(): Promise<{ status: string; network: string; dryRun: boolean }> {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Stellar service health check failed: ${error.message}`);
      }
      throw new Error('Stellar service health check failed: unknown error');
    }
  }

  /**
   * Discover payment paths from stellar-service
   */
  async findPaths(params: {
    sourceAssetCode: string;
    sourceAssetIssuer?: string;
    destinationAssetCode: string;
    destinationAssetIssuer?: string;
    destinationAmount: string;
  }): Promise<any[]> {
    const secret = process.env.STELLAR_SERVICE_SECRET;
    const response = await this.client.get('/paths', {
      params,
      headers: { Authorization: `Bearer ${secret}` },
    });
    return response.data.data;
  }

  /**
   * Get orderbook from stellar-service
   */
  async getOrderbook(params: {
    baseAssetCode: string;
    baseAssetIssuer?: string;
    counterAssetCode: string;
    counterAssetIssuer?: string;
  }): Promise<any> {
    const response = await this.client.get('/orderbook', { params });
    return response.data.data;
  }
}

export const stellarClient = new StellarClient();
