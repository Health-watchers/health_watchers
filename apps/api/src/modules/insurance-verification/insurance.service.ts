import {
  BenefitDetail,
  ClaimAppeal,
  EligibilityResult,
  InsuranceClaim,
  InsurancePolicy,
  PriorAuthorization,
} from './insurance.types';

const ELIGIBILITY_TIMEOUT_MS = 10_000;
const MIN_CONFIDENCE = 0.95;

interface ClearinghouseClient {
  checkEligibility(policy: InsurancePolicy): Promise<{
    active: boolean;
    effectiveDate?: string;
    terminationDate?: string;
    copay?: number;
    coinsurance?: number;
    deductible?: number;
    deductibleMet?: number;
    outOfPocketMax?: number;
    outOfPocketMet?: number;
    confidence: number;
  }>;
}

/** Default clearinghouse adapter. Swap with a real X12 270/271 client in production. */
class SimulatedClearinghouseClient implements ClearinghouseClient {
  async checkEligibility(policy: InsurancePolicy) {
    return {
      active: true,
      effectiveDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      copay: 25,
      coinsurance: 0.2,
      deductible: 1500,
      deductibleMet: 400,
      outOfPocketMax: 6000,
      outOfPocketMet: 400,
      confidence: 0.98,
    };
  }
}

/**
 * InsuranceVerificationService covers real-time eligibility checking,
 * benefit verification, authorization workflows, claim submission and
 * status tracking, denial handling, appeals, and reporting analytics.
 */
export class InsuranceVerificationService {
  private eligibilityCache = new Map<string, EligibilityResult>();
  private authorizations: PriorAuthorization[] = [];
  private claims = new Map<string, InsuranceClaim>();
  private appeals: ClaimAppeal[] = [];

  constructor(private readonly clearinghouse: ClearinghouseClient = new SimulatedClearinghouseClient()) {}

  /** Integrates with the insurance clearinghouse API and enforces the <10s SLA. */
  async verifyEligibility(policy: InsurancePolicy): Promise<EligibilityResult> {
    const start = Date.now();

    const response = await this.withTimeout(
      this.clearinghouse.checkEligibility(policy),
      ELIGIBILITY_TIMEOUT_MS,
    );

    const result: EligibilityResult = {
      id: `elig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      patientId: policy.patientId,
      payerId: policy.payerId,
      checkedAt: new Date().toISOString(),
      active: response.active,
      effectiveDate: response.effectiveDate,
      terminationDate: response.terminationDate,
      copay: response.copay,
      coinsurance: response.coinsurance,
      deductible: response.deductible,
      deductibleMet: response.deductibleMet,
      outOfPocketMax: response.outOfPocketMax,
      outOfPocketMet: response.outOfPocketMet,
      latencyMs: Date.now() - start,
      confidence: response.confidence,
    };

    if (result.confidence < MIN_CONFIDENCE) {
      result.active = false;
    }

    this.eligibilityCache.set(`${policy.patientId}:${policy.payerId}`, result);
    return result;
  }

  getCachedEligibility(patientId: string, payerId: string): EligibilityResult | undefined {
    return this.eligibilityCache.get(`${patientId}:${payerId}`);
  }

  /** Coverage verification for a specific service type against cached eligibility. */
  checkCoverage(patientId: string, payerId: string, serviceType: string): BenefitDetail {
    const eligibility = this.eligibilityCache.get(`${patientId}:${payerId}`);
    if (!eligibility || !eligibility.active) {
      return { serviceType, covered: false, requiresAuthorization: false, notes: 'No active coverage on file' };
    }

    const authRequiredServices = new Set(['imaging_mri', 'imaging_ct', 'inpatient_admission', 'surgery']);
    return {
      serviceType,
      covered: true,
      requiresAuthorization: authRequiredServices.has(serviceType),
      copay: eligibility.copay,
    };
  }

  /** Benefit verification, returning full remaining deductible/OOP detail. */
  verifyBenefits(patientId: string, payerId: string): {
    remainingDeductible: number;
    remainingOutOfPocket: number;
  } | null {
    const eligibility = this.eligibilityCache.get(`${patientId}:${payerId}`);
    if (!eligibility) return null;
    return {
      remainingDeductible: Math.max(0, (eligibility.deductible ?? 0) - (eligibility.deductibleMet ?? 0)),
      remainingOutOfPocket: Math.max(
        0,
        (eligibility.outOfPocketMax ?? 0) - (eligibility.outOfPocketMet ?? 0),
      ),
    };
  }

  /** Prior authorization workflow. */
  requestAuthorization(patientId: string, serviceType: string): PriorAuthorization {
    const auth: PriorAuthorization = {
      id: `auth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      patientId,
      serviceType,
      status: 'pending',
      requestedAt: new Date().toISOString(),
    };
    this.authorizations.push(auth);
    return auth;
  }

  decideAuthorization(authId: string, approved: boolean, denialReason?: string): PriorAuthorization {
    const auth = this.authorizations.find((a) => a.id === authId);
    if (!auth) throw new Error('Authorization not found');
    auth.status = approved ? 'approved' : 'denied';
    auth.decidedAt = new Date().toISOString();
    if (approved) {
      auth.expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    } else {
      auth.denialReason = denialReason;
    }
    return auth;
  }

  /** Automated insurance claim submission. */
  submitClaim(input: {
    patientId: string;
    payerId: string;
    serviceType: string;
    billedAmount: number;
  }): InsuranceClaim {
    const claim: InsuranceClaim = {
      id: `claim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      patientId: input.patientId,
      payerId: input.payerId,
      serviceType: input.serviceType,
      billedAmount: input.billedAmount,
      submittedAt: new Date().toISOString(),
      status: 'submitted',
    };
    this.claims.set(claim.id, claim);
    return claim;
  }

  /** Claim status tracking. */
  getClaimStatus(claimId: string): InsuranceClaim | undefined {
    return this.claims.get(claimId);
  }

  updateClaimStatus(
    claimId: string,
    status: InsuranceClaim['status'],
    details?: { paidAmount?: number; denialCode?: string; denialReason?: string },
  ): InsuranceClaim {
    const claim = this.claims.get(claimId);
    if (!claim) throw new Error('Claim not found');
    claim.status = status;
    if (details?.paidAmount !== undefined) claim.paidAmount = details.paidAmount;
    if (details?.denialCode) claim.denialCode = details.denialCode;
    if (details?.denialReason) claim.denialReason = details.denialReason;
    return claim;
  }

  /** Denial handling — surfaces denied claims eligible for appeal. */
  getDeniedClaims(patientId: string): InsuranceClaim[] {
    return Array.from(this.claims.values()).filter(
      (c) => c.patientId === patientId && c.status === 'denied',
    );
  }

  /** Appeal workflow for denied claims. */
  fileAppeal(claimId: string, notes?: string): ClaimAppeal {
    const claim = this.claims.get(claimId);
    if (!claim || claim.status !== 'denied') {
      throw new Error('Only denied claims can be appealed');
    }
    claim.status = 'appealed';

    const appeal: ClaimAppeal = {
      id: `appeal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      claimId,
      submittedAt: new Date().toISOString(),
      status: 'pending',
      notes,
    };
    this.appeals.push(appeal);
    return appeal;
  }

  resolveAppeal(appealId: string, overturned: boolean): ClaimAppeal {
    const appeal = this.appeals.find((a) => a.id === appealId);
    if (!appeal) throw new Error('Appeal not found');
    appeal.status = overturned ? 'overturned' : 'upheld';
    appeal.resolvedAt = new Date().toISOString();

    if (overturned) {
      const claim = this.claims.get(appeal.claimId);
      if (claim) claim.status = 'accepted';
    }
    return appeal;
  }

  /** Insurance analytics/reporting across verifications and claims. */
  getAnalytics(): {
    totalVerifications: number;
    avgLatencyMs: number;
    activeRate: number;
    totalClaims: number;
    claimsByStatus: Record<string, number>;
    appealOverturnRate: number;
  } {
    const eligibilities = Array.from(this.eligibilityCache.values());
    const claims = Array.from(this.claims.values());
    const resolvedAppeals = this.appeals.filter((a) => a.status !== 'pending');

    const claimsByStatus = claims.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalVerifications: eligibilities.length,
      avgLatencyMs: eligibilities.length
        ? eligibilities.reduce((sum, e) => sum + e.latencyMs, 0) / eligibilities.length
        : 0,
      activeRate: eligibilities.length
        ? eligibilities.filter((e) => e.active).length / eligibilities.length
        : 0,
      totalClaims: claims.length,
      claimsByStatus,
      appealOverturnRate: resolvedAppeals.length
        ? resolvedAppeals.filter((a) => a.status === 'overturned').length / resolvedAppeals.length
        : 0,
    };
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Eligibility check exceeded SLA timeout')), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }
}

export const insuranceVerificationService = new InsuranceVerificationService();
