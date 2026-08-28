/**
 * Patient Demographics Validator
 * Validates DOB, insurance, contact information
 * Issue #1237
 */

export interface DemographicValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

export class PatientDemographicsValidator {
  /**
   * Validate date of birth
   */
  validateDateOfBirth(dob: string | Date): DemographicValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const birthDate = typeof dob === 'string' ? new Date(dob) : dob;

      if (isNaN(birthDate.getTime())) {
        errors.push('Invalid date format for date of birth');
        return { valid: false, errors };
      }

      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();

      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        // Adjustment for not yet reached birthday this year
      }

      // Validate age range
      if (age < 0) {
        errors.push('Date of birth cannot be in the future');
      } else if (age < 0.033) {
        // Less than 12 hours old
        warnings.push('Patient is extremely newborn - verify date is correct');
      } else if (age > 150) {
        errors.push('Date of birth indicates age over 150 years');
      }

      // Check if reasonable for pediatric/geriatric care
      if (age > 120) {
        warnings.push('Patient age appears exceptionally high');
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      return { valid: false, errors: ['Failed to validate date of birth'] };
    }
  }

  /**
   * Calculate age from date of birth
   */
  calculateAge(dob: Date): { years: number; months: number; days: number } {
    const today = new Date();
    let years = today.getFullYear() - dob.getFullYear();
    let months = today.getMonth() - dob.getMonth();
    let days = today.getDate() - dob.getDate();

    if (days < 0) {
      months--;
      const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      days += prevMonth.getDate();
    }

    if (months < 0) {
      years--;
      months += 12;
    }

    return { years, months, days };
  }

  /**
   * Validate phone number
   */
  validatePhoneNumber(phone: string, region: string = 'US'): DemographicValidationResult {
    const errors: string[] = [];

    if (!phone) {
      errors.push('Phone number is required');
      return { valid: false, errors };
    }

    // Remove common separators
    const cleanPhone = phone.replace(/[\s\-()\.]/g, '');

    if (region === 'US') {
      // US format: 10 digits
      if (!/^\d{10}$/.test(cleanPhone)) {
        errors.push('US phone number must be 10 digits');
      }

      // Validate area code (not 000-999 or invalid patterns)
      const areaCode = cleanPhone.substring(0, 3);
      if (areaCode === '000' || areaCode === '999') {
        errors.push('Invalid US area code');
      }
    } else if (region === 'UK') {
      // UK format: 11 digits
      if (!/^\d{10,11}$/.test(cleanPhone)) {
        errors.push('UK phone number must be 10-11 digits');
      }
    } else if (region === 'CA') {
      // Canada: same as US (10 digits)
      if (!/^\d{10}$/.test(cleanPhone)) {
        errors.push('Canadian phone number must be 10 digits');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate email address
   */
  validateEmail(email: string): DemographicValidationResult {
    const errors: string[] = [];

    if (!email) {
      errors.push('Email address is required');
      return { valid: false, errors };
    }

    // RFC 5322 simplified pattern
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
      errors.push('Invalid email format');
    }

    // Additional checks
    if (email.length > 254) {
      errors.push('Email address is too long');
    }

    const [localPart] = email.split('@');
    if (localPart.length > 64) {
      errors.push('Email local part is too long');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate insurance information
   */
  validateInsurance(insurance: {
    provider?: string;
    memberId?: string;
    groupId?: string;
    policyType?: string;
  }): DemographicValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!insurance.provider) {
      warnings.push('Insurance provider not specified');
    }

    if (!insurance.memberId) {
      errors.push('Member ID is required');
    } else if (insurance.memberId.length < 3) {
      errors.push('Member ID appears too short');
    }

    if (insurance.groupId && insurance.groupId.length < 2) {
      warnings.push('Group ID appears unusually short');
    }

    if (!insurance.policyType) {
      warnings.push('Policy type not specified');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Validate demographic data package
   */
  validateDemographics(data: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: Date;
    email?: string;
    phoneNumber?: string;
    region?: string;
  }): DemographicValidationResult {
    const allErrors: string[] = [];

    if (!data.firstName || data.firstName.trim().length === 0) {
      allErrors.push('First name is required');
    }

    if (!data.lastName || data.lastName.trim().length === 0) {
      allErrors.push('Last name is required');
    }

    if (data.dateOfBirth) {
      const dobResult = this.validateDateOfBirth(data.dateOfBirth);
      if (!dobResult.valid) {
        allErrors.push(...dobResult.errors);
      }
    }

    if (data.email) {
      const emailResult = this.validateEmail(data.email);
      if (!emailResult.valid) {
        allErrors.push(...emailResult.errors);
      }
    }

    if (data.phoneNumber) {
      const phoneResult = this.validatePhoneNumber(data.phoneNumber, data.region);
      if (!phoneResult.valid) {
        allErrors.push(...phoneResult.errors);
      }
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
    };
  }
}

export const patientDemographicsValidator = new PatientDemographicsValidator();
