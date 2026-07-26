import { config } from '@health-watchers/config';
import axios from 'axios';

export interface EscrowParams {
  paymentId: string;
  amount: string;
  destination: string;
  encounterId: string;
}

export interface EscrowResponse {
  contractId: string;
  txHash: string;
}

export class SorobanEscrowService {
  private stellarServiceUrl = config.stellarServiceUrl || 'http://localhost:3002';

  async createEscrow(params: EscrowParams): Promise<EscrowResponse> {
    try {
      const response = await axios.post(
        `${this.stellarServiceUrl}/api/v1/soroban/escrow/create`,
        {
          paymentId: params.paymentId,
          amount: params.amount,
          destination: params.destination,
          encounterId: params.encounterId,
        },
        { timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create Soroban escrow: ${error}`);
    }
  }

  async releaseEscrow(contractId: string): Promise<{ txHash: string }> {
    try {
      const response = await axios.post(
        `${this.stellarServiceUrl}/api/v1/soroban/escrow/release`,
        { contractId },
        { timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to release Soroban escrow: ${error}`);
    }
  }

  async cancelEscrow(contractId: string): Promise<{ txHash: string }> {
    try {
      const response = await axios.post(
        `${this.stellarServiceUrl}/api/v1/soroban/escrow/cancel`,
        { contractId },
        { timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to cancel Soroban escrow: ${error}`);
    }
  }
}

export const sorobanEscrowService = new SorobanEscrowService();
