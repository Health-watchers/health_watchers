/**
 * Password Policy Service
 * Enforces password complexity requirements and prevents reuse
 * Issue #1235
 */

import { UserModel } from '../models/user.model';

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  specialCharPattern: RegExp;
  passwordHistoryLimit: number;
  expiryDays: number;
}

const DEFAULT_POLICY: PasswordPolicy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  specialCharPattern: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
  passwordHistoryLimit: 5,
  expiryDays: 90,
};

export class PasswordPolicyService {
  private policy: PasswordPolicy;

  constructor(policy: Partial<PasswordPolicy> = {}) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
  }

  /**
   * Validate password against policy
   */
  validatePassword(password: string): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (password.length < this.policy.minLength) {
      errors.push(`Password must be at least ${this.policy.minLength} characters long`);
    }

    if (this.policy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (this.policy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (this.policy.requireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (this.policy.requireSpecialChars && !this.policy.specialCharPattern.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if password has been used before (password history)
   */
  async checkPasswordHistory(
    userId: string,
    newPassword: string,
    hashedPassword: (pwd: string) => Promise<string>,
    comparePassword: (pwd: string, hash: string) => Promise<boolean>
  ): Promise<boolean> {
    const user = await UserModel.findById(userId).select('passwordHistory');
    if (!user || !user.passwordHistory || user.passwordHistory.length === 0) {
      return true; // No history to check
    }

    for (const historicalHash of user.passwordHistory) {
      const matches = await comparePassword(newPassword, historicalHash);
      if (matches) {
        return false; // Password was used before
      }
    }

    return true;
  }

  /**
   * Add password to history and trim old entries
   */
  async updatePasswordHistory(userId: string, hashedPassword: string): Promise<void> {
    await UserModel.findByIdAndUpdate(
      userId,
      {
        $push: {
          passwordHistory: {
            $each: [hashedPassword],
            $slice: -this.policy.passwordHistoryLimit,
          },
        },
        passwordChangedAt: new Date(),
      },
      { new: true }
    );
  }

  /**
   * Check if password has expired
   */
  async isPasswordExpired(userId: string): Promise<boolean> {
    const user = await UserModel.findById(userId).select('passwordChangedAt');
    if (!user || !user.passwordChangedAt) {
      return false;
    }

    const passwordAge = Date.now() - user.passwordChangedAt.getTime();
    const expiryMs = this.policy.expiryDays * 24 * 60 * 60 * 1000;
    return passwordAge > expiryMs;
  }

  getPolicy(): PasswordPolicy {
    return this.policy;
  }
}

export const defaultPasswordPolicy = new PasswordPolicyService();
