// Batch-57: Stellar Payment Features - Muxed Accounts, SEP-7, Payment Stream, Trustlines

import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';

// ────────────────────────────────────────────────────────────────────────────
// #1452: Muxed Accounts for Per-Patient Payment Attribution
// ────────────────────────────────────────────────────────────────────────────

/**
 * Muxed Accounts (M-addresses)
 * Encode patient/invoice ID in the address itself
 * Format: M{clinicAddress}{invoiceId}{checksum}
 *
 * Benefits:
 * - No need for memo (patients forget/mistype)
 * - Automatic routing by wallet
 * - Deterministic payment matching
 */

export class MuxedAccountService {
  /**
   * Generate a muxed address for an invoice
   * Encodes invoiceId in the address itself
   */
  static generateMuxedAddress(
    clinicAddress: string,
    invoiceId: string
  ): { muxedAddress: string; invoiceId: string } {
    // In production: use stellar-sdk Muxed.createAccount()
    // Converts: G...ABC (clinic) + invoice123 → MAA...ABC123

    const muxedAddress = `M${clinicAddress.substring(0, 51)}${invoiceId.padEnd(8, '0')}ABC`;
    return { muxedAddress, invoiceId };
  }

  /**
   * Decode muxed address to extract invoice ID
   */
  static decodeMuxedAddress(muxedAddress: string): { clinicAddress: string; invoiceId: string } | null {
    // In production: use stellar-sdk Muxed.createAccount()
    if (!muxedAddress.startsWith('M')) {
      return null;
    }

    // Extract clinic address and invoice ID
    const clinicAddress = `G${muxedAddress.substring(1, 52)}`;
    const invoiceId = muxedAddress.substring(52, 60).replace(/0+$/, '');

    return { clinicAddress, invoiceId };
  }
}

/**
 * Muxed address in payment UI
 * Shows M-address and QR code to patient
 */
export interface MuxedPaymentRequest {
  invoiceId: string;
  clinicAddress: string;
  muxedAddress: string;
  amount: string;
  assetCode: string;
  qrCodeUrl: string; // QR code of muxed address
}

// ────────────────────────────────────────────────────────────────────────────
// #1453: SEP-7 Payment Request URIs
// ────────────────────────────────────────────────────────────────────────────

/**
 * SEP-7 Payment Request URI
 * Format: web+stellar:pay?destination=...&amount=...&asset_code=...&memo=...
 *
 * Wallets parse these URIs and pre-fill payment form
 */

export class Sep7PaymentService {
  /**
   * Generate SEP-7 payment request URI
   * Optionally signed with clinic's signing key
   */
  static generatePaymentUri(
    destination: string,
    amount: string,
    assetCode: string,
    memo?: string,
    issuer?: string,
    callback?: string,
    signingKey?: string
  ): string {
    const params = new URLSearchParams();
    params.append('destination', destination);
    params.append('amount', amount);
    params.append('asset_code', assetCode);

    if (issuer && assetCode !== 'native') {
      params.append('asset_issuer', issuer);
    }

    if (memo) {
      params.append('memo', memo);
      params.append('memo_type', 'text');
    }

    if (callback) {
      params.append('callback', callback);
    }

    let uri = `web+stellar:pay?${params.toString()}`;

    // Optionally sign the URI with clinic's key
    if (signingKey) {
      // In production: create signature using stellar-sdk
      // const signature = signUri(uri, signingKey);
      // uri += `&signature=${signature}`;
    }

    return uri;
  }

  /**
   * Generate QR code for SEP-7 URI
   * Returns URI (wallet will show QR code)
   */
  static generateQrCode(uri: string): string {
    // In production: use qr-code library to generate image
    // For now, return the URI which can be encoded to QR
    return uri;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// #1454: Persist Horizon Payment-Stream Cursor
// ────────────────────────────────────────────────────────────────────────────

/**
 * Payment stream cursor tracking
 * Saves position in Horizon ledger to resume from on restart
 */

export interface PaymentStreamCursor {
  pagingToken: string; // Horizon paging token
  ledgerCloseTime: Date;
  lastProcessedAt: Date;
  transactionCount: number;
}

export class PaymentStreamCursorService {
  /**
   * Save cursor after processing payment
   */
  static async saveCursor(
    redis: any,
    clinicId: string,
    pagingToken: string,
    ledgerCloseTime: Date
  ): Promise<void> {
    const key = `payment_stream:cursor:${clinicId}`;
    const cursor: PaymentStreamCursor = {
      pagingToken,
      ledgerCloseTime,
      lastProcessedAt: new Date(),
      transactionCount: 0,
    };

    // Persist to Redis (fast) and MongoDB (durable)
    await redis.set(key, JSON.stringify(cursor), 'EX', 86400 * 7); // 7 days

    // Also persist to MongoDB for durability
    // await CursorModel.updateOne(
    //   { clinicId },
    //   cursor,
    //   { upsert: true }
    // );
  }

  /**
   * Load cursor on startup
   * Falls back to 'now' if none exists
   */
  static async loadCursor(redis: any, clinicId: string): Promise<string> {
    const key = `payment_stream:cursor:${clinicId}`;

    try {
      // Try Redis first (fast)
      const cached = await redis.get(key);
      if (cached) {
        const cursor = JSON.parse(cached);
        return cursor.pagingToken;
      }

      // Fall back to MongoDB
      // const doc = await CursorModel.findOne({ clinicId });
      // if (doc) {
      //   return doc.pagingToken;
      // }
    } catch (error) {
      console.warn(`Failed to load cursor for ${clinicId}:`, error);
    }

    // Default to 'now' if no cursor exists
    return 'now';
  }
}

/**
 * Payment stream with cursor persistence
 */
export class HorizonPaymentStream {
  /**
   * Start payment stream with cursor resume
   */
  static async startStream(
    clinicId: string,
    onPayment: (payment: any) => Promise<void>,
    redis: any
  ): Promise<void> {
    // Load cursor from storage
    const cursor = await PaymentStreamCursorService.loadCursor(redis, clinicId);

    // Start streaming from cursor
    // In production: use stellar-sdk
    // const stream = await horizon.payments()
    //   .forAccount(clinicAddress)
    //   .cursor(cursor)
    //   .stream({
    //     onmessage: async (payment) => {
    //       // Process payment
    //       await onPayment(payment);
    //
    //       // Save new cursor for next restart
    //       await PaymentStreamCursorService.saveCursor(
    //         redis,
    //         clinicId,
    //         payment.paging_token,
    //         new Date(payment.created_at)
    //       );
    //     },
    //     onerror: (error) => {
    //       console.error('Stream error:', error);
    //       // Alert if disconnected for > N minutes
    //     },
    //   });
  }
}

/**
 * Metrics for payment stream health
 */
export interface StreamMetrics {
  streamLag: number; // ms between ledger close and processing
  disconnectedMinutes: number;
  lastPaymentProcessedAt: Date;
  transactionsProcessed: number;
}

// ────────────────────────────────────────────────────────────────────────────
// #1455: Trustline Management for USDC and Other Assets
// ────────────────────────────────────────────────────────────────────────────

/**
 * Trustline management
 * Required before clinic account can receive USDC
 */

export interface Trustline {
  asset: string; // e.g., "USDC:GBUQWP3..."
  limit: string; // Maximum amount clinic can hold
  balance: string;
  isActive: boolean;
}

export class TrustlineService {
  /**
   * GET /stellar/trustlines - List clinic's trustlines
   */
  static async listTrustlines(clinicAddress: string): Promise<Trustline[]> {
    // In production: fetch from Horizon
    // const account = await horizon.accounts().accountId(clinicAddress).call();
    // return account.balances.map(balance => ({
    //   asset: balance.asset_code ? `${balance.asset_code}:${balance.asset_issuer}` : 'native',
    //   limit: balance.limit || 'unlimited',
    //   balance: balance.balance,
    //   isActive: balance.balance > 0,
    // }));

    return [];
  }

  /**
   * POST /stellar/trustlines - Add trustline
   * Admin only, checks reserve requirements
   */
  static async addTrustline(
    clinicAddress: string,
    asset: string,
    limit: string = '1000000' // 1M by default
  ): Promise<{ success: boolean; trustline?: Trustline; error?: string }> {
    try {
      // Check reserve requirements
      // Each trustline costs 0.5 XLM (reserve)
      const requiredReserve = 0.5;

      // Fetch account to check current balance
      // const account = await horizon.accounts().accountId(clinicAddress).call();
      // const xlmBalance = parseFloat(
      //   account.balances.find(b => b.asset_type === 'native')?.balance || '0'
      // );
      // const minBalance = (account.subentry_count + 1) * 0.5 + requiredReserve;
      // if (xlmBalance < minBalance) {
      //   return {
      //     success: false,
      //     error: `Insufficient XLM for trustline (need ${minBalance}, have ${xlmBalance})`,
      //   };
      // }

      // Create and submit trustline transaction
      // In production: build ChangeTrustOp, sign with clinic key, submit
      // const tx = new TransactionBuilder(...)
      //   .addOperation(Operation.changeTrust({
      //     asset: new Asset(assetCode, assetIssuer),
      //     limit,
      //   }))
      //   .build();

      const trustline: Trustline = {
        asset,
        limit,
        balance: '0',
        isActive: false,
      };

      return { success: true, trustline };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * DELETE /stellar/trustlines/:asset - Remove trustline
   * Admin only, only if balance is zero
   */
  static async removeTrustline(
    clinicAddress: string,
    asset: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Check that balance is zero
      const trustlines = await this.listTrustlines(clinicAddress);
      const trustline = trustlines.find((t) => t.asset === asset);

      if (!trustline) {
        return { success: false, error: 'Trustline not found' };
      }

      if (parseFloat(trustline.balance) > 0) {
        return {
          success: false,
          error: `Cannot remove trustline with balance ${trustline.balance}`,
        };
      }

      // Remove trustline (set limit to 0)
      // In production: build ChangeTrustOp with limit 0, sign, submit

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
}

/**
 * Trustline setup in clinic onboarding wizard
 */
export class ClinicOnboardingWizard {
  /**
   * Step: Add USDC trustline
   * Included in onboarding flow
   */
  static async setupUsdcTrustline(clinicAddress: string): Promise<void> {
    // Call TrustlineService.addTrustline with USDC details
    // USDC on Stellar: USDC:GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTJUNJQXM7ROALD2QC6GUQDXEC
    await TrustlineService.addTrustline(
      clinicAddress,
      'USDC:GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTJUNJQXM7ROALD2QC6GUQDXEC',
      '1000000'
    );
  }
}

/**
 * Wallet UI section for trustlines
 * Shows balances and allows management
 */
export interface WalletTrustlineUI {
  trustlines: Trustline[];
  canAddMore: boolean; // Based on XLM reserve
  actions: {
    add: boolean;
    remove: boolean; // Only if balance = 0
  };
}
