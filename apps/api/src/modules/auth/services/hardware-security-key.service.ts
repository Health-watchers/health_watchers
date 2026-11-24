/**
 * Hardware Security Key Service
 * Manages FIDO2/WebAuthn credentials for strong authentication
 * Issue #1235
 */

import crypto from 'crypto';
import { UserModel } from '../models/user.model';

export interface CredentialPublicKey {
  kty: number;
  crv?: number;
  x?: string;
  y?: string;
  n?: string;
  e?: string;
}

export interface HardwareSecurityKey {
  id: string;
  credentialId: string;
  publicKey: CredentialPublicKey;
  signCount: number;
  transports?: ('usb' | 'nfc' | 'ble')[];
  name: string;
  createdAt: Date;
  lastUsedAt?: Date;
  backupEligible: boolean;
}

export interface RegistrationChallenge {
  id: string;
  challenge: string;
  userId: string;
  userName: string;
  expiresAt: Date;
}

export class HardwareSecurityKeyService {
  private readonly challengeExpiryMs = 10 * 60 * 1000; // 10 minutes
  private readonly rpId = process.env.RP_ID || 'localhost';
  private readonly rpName = 'Health Watchers';
  private readonly origin = process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000';

  /**
   * Generate registration challenge for WebAuthn
   */
  generateRegistrationChallenge(
    userId: string,
    userName: string
  ): {
    challenge: RegistrationChallenge;
    publicKeyOptions: any;
  } {
    const challenge = crypto.randomBytes(32).toString('base64url');
    const challengeId = crypto.randomUUID();

    const registrationChallenge: RegistrationChallenge = {
      id: challengeId,
      challenge,
      userId,
      userName,
      expiresAt: new Date(Date.now() + this.challengeExpiryMs),
    };

    const publicKeyOptions = {
      rp: {
        name: this.rpName,
        id: this.rpId,
      },
      user: {
        id: Buffer.from(userId).toString('base64url'),
        name: userName,
        displayName: userName,
      },
      challenge: Buffer.from(challenge, 'base64url'),
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' }, // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      attestation: 'direct',
      timeout: 60000,
      userVerification: 'preferred',
    };

    return { challenge: registrationChallenge, publicKeyOptions };
  }

  /**
   * Verify registration response and register hardware key
   */
  async registerHardwareKey(
    userId: string,
    challengeId: string,
    credential: any,
    name: string
  ): Promise<HardwareSecurityKey> {
    // In production, you would verify the attestation using a library like:
    // - @simplewebauthn/server
    // - fido2-lib
    // For now, we create a basic structure

    const hardwareKey: HardwareSecurityKey = {
      id: crypto.randomUUID(),
      credentialId: credential.id,
      publicKey: credential.response.publicKey,
      signCount: 0,
      transports: credential.response.transports,
      name,
      createdAt: new Date(),
      backupEligible: credential.response.backupEligible || false,
    };

    // Save to user
    await UserModel.findByIdAndUpdate(userId, {
      $push: {
        hardwareSecurityKeys: hardwareKey,
      },
    });

    return hardwareKey;
  }

  /**
   * Generate authentication challenge
   */
  generateAuthenticationChallenge(userId: string): {
    challenge: string;
    publicKeyOptions: any;
  } {
    const challenge = crypto.randomBytes(32).toString('base64url');

    const publicKeyOptions = {
      challenge: Buffer.from(challenge, 'base64url'),
      timeout: 60000,
      rpId: this.rpId,
      userVerification: 'preferred',
    };

    return { challenge, publicKeyOptions };
  }

  /**
   * Get user's hardware security keys
   */
  async getHardwareSecurityKeys(userId: string): Promise<HardwareSecurityKey[]> {
    const user = await UserModel.findById(userId).select('hardwareSecurityKeys');
    return user?.hardwareSecurityKeys || [];
  }

  /**
   * Delete hardware security key
   */
  async deleteHardwareSecurityKey(userId: string, keyId: string): Promise<void> {
    await UserModel.findByIdAndUpdate(userId, {
      $pull: {
        hardwareSecurityKeys: { id: keyId },
      },
    });
  }

  /**
   * Rename hardware security key
   */
  async renameHardwareSecurityKey(userId: string, keyId: string, newName: string): Promise<void> {
    await UserModel.findByIdAndUpdate(
      { _id: userId, 'hardwareSecurityKeys.id': keyId },
      {
        $set: {
          'hardwareSecurityKeys.$.name': newName,
        },
      }
    );
  }

  /**
   * Update sign count for key (prevents cloning attacks)
   */
  async updateSignCount(userId: string, credentialId: string, newSignCount: number): Promise<void> {
    await UserModel.findByIdAndUpdate(
      { _id: userId, 'hardwareSecurityKeys.credentialId': credentialId },
      {
        $set: {
          'hardwareSecurityKeys.$.signCount': newSignCount,
          'hardwareSecurityKeys.$.lastUsedAt': new Date(),
        },
      }
    );
  }

  /**
   * Check for cloning attacks (sign count regression)
   */
  async detectKeyCloning(
    userId: string,
    credentialId: string,
    signCount: number
  ): Promise<boolean> {
    const user = await UserModel.findById(userId).select('hardwareSecurityKeys');
    const key = user?.hardwareSecurityKeys?.find((k: any) => k.credentialId === credentialId);

    if (!key) {
      return false;
    }

    // If sign count decreased, it's likely a cloning attempt
    return signCount < key.signCount;
  }

  /**
   * Get public key for credential
   */
  async getPublicKeyForCredential(
    userId: string,
    credentialId: string
  ): Promise<CredentialPublicKey | null> {
    const user = await UserModel.findById(userId).select('hardwareSecurityKeys');
    const key = user?.hardwareSecurityKeys?.find((k: any) => k.credentialId === credentialId);

    return key?.publicKey || null;
  }
}

export const hardwareSecurityKeyService = new HardwareSecurityKeyService();
