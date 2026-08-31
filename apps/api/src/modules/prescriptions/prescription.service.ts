import {
  PharmacyTransmission,
  PrescriptionAuditEntry,
  PrescriptionRecord,
  PrescriptionStatus,
  RefillRequest,
} from './prescription.types';

const CONTROLLED_SCHEDULES = new Set(['I', 'II', 'III', 'IV', 'V']);
const DEFAULT_EXPIRATION_DAYS = 365;
const CONTROLLED_EXPIRATION_DAYS = 30;
const FRAUD_SCORE_THRESHOLD = 0.75;

/**
 * PrescriptionEngine implements the end-to-end prescription workflow:
 * generation, e-prescribing, refill automation, expiration tracking,
 * pharmacy integration, history, compliance, authorization, fraud
 * detection, and analytics.
 */
export class PrescriptionEngine {
  private prescriptions = new Map<string, PrescriptionRecord>();
  private refillRequests: RefillRequest[] = [];
  private transmissions: PharmacyTransmission[] = [];
  private auditTrail: PrescriptionAuditEntry[] = [];

  generatePrescription(input: {
    patientId: string;
    prescriberId: string;
    medicationCode: string;
    medicationName: string;
    dosage: string;
    route: string;
    frequency: string;
    quantity: number;
    refillsAllowed: number;
    daysSupply: number;
    deaScheduleClass?: 'I' | 'II' | 'III' | 'IV' | 'V';
  }): PrescriptionRecord {
    const now = new Date();
    const isControlled = !!input.deaScheduleClass && CONTROLLED_SCHEDULES.has(input.deaScheduleClass);
    const expirationDays = isControlled ? CONTROLLED_EXPIRATION_DAYS : DEFAULT_EXPIRATION_DAYS;
    const expiresAt = new Date(now.getTime() + expirationDays * 24 * 60 * 60 * 1000);

    const record: PrescriptionRecord = {
      id: `rx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      patientId: input.patientId,
      prescriberId: input.prescriberId,
      medicationCode: input.medicationCode,
      medicationName: input.medicationName,
      dosage: input.dosage,
      route: input.route,
      frequency: input.frequency,
      quantity: input.quantity,
      refillsAllowed: input.refillsAllowed,
      refillsUsed: 0,
      daysSupply: input.daysSupply,
      status: isControlled ? 'pending_authorization' : 'draft',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      authorizationRequired: isControlled,
      isControlledSubstance: isControlled,
      deaScheduleClass: input.deaScheduleClass,
    };

    this.prescriptions.set(record.id, record);
    this.recordAudit(record.id, 'created', input.prescriberId);
    this.runComplianceCheck(record.id);
    this.runFraudDetection(record.id);
    return record;
  }

  getPrescription(id: string): PrescriptionRecord | undefined {
    return this.prescriptions.get(id);
  }

  /** Requires prior authorization workflow completion before dispensing. */
  requireAuthorization(id: string, authorizationId: string): PrescriptionRecord {
    const rx = this.mustFind(id);
    rx.authorizationId = authorizationId;
    rx.status = 'authorized';
    rx.updatedAt = new Date().toISOString();
    this.recordAudit(id, 'authorized', 'system', { authorizationId });
    return rx;
  }

  /** Transmits an authorized prescription to a pharmacy via e-prescription integration. */
  sendToPharmacy(id: string, pharmacyNcpdpId: string): PharmacyTransmission {
    const rx = this.mustFind(id);
    if (rx.authorizationRequired && rx.status !== 'authorized') {
      throw new Error('Prescription requires authorization before pharmacy transmission');
    }
    if (this.isExpired(rx)) {
      throw new Error('Cannot transmit an expired prescription');
    }

    rx.pharmacyId = pharmacyNcpdpId;
    rx.status = 'sent_to_pharmacy';
    rx.updatedAt = new Date().toISOString();

    const transmission: PharmacyTransmission = {
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      prescriptionId: id,
      pharmacyNcpdpId,
      transmittedAt: new Date().toISOString(),
      status: 'transmitted',
    };
    this.transmissions.push(transmission);
    this.recordAudit(id, 'transmitted_to_pharmacy', 'system', { pharmacyNcpdpId });
    return transmission;
  }

  acknowledgePharmacyFill(transmissionId: string, partial = false): void {
    const tx = this.transmissions.find((t) => t.id === transmissionId);
    if (!tx) throw new Error('Transmission not found');
    tx.acknowledgedAt = new Date().toISOString();
    tx.status = 'acknowledged';

    const rx = this.mustFind(tx.prescriptionId);
    rx.status = partial ? 'partially_filled' : 'filled';
    rx.updatedAt = new Date().toISOString();
    this.recordAudit(rx.id, partial ? 'partially_filled' : 'filled', 'pharmacy');
  }

  /** Automated medication refill request handling. */
  requestRefill(prescriptionId: string, requestedBy: RefillRequest['requestedBy']): RefillRequest {
    const rx = this.mustFind(prescriptionId);
    if (this.isExpired(rx)) {
      rx.status = 'expired';
      throw new Error('Prescription has expired; cannot refill');
    }
    if (rx.refillsUsed >= rx.refillsAllowed) {
      throw new Error('No refills remaining; new prescription required');
    }

    const autoApprove = !rx.isControlledSubstance && requestedBy !== 'provider';
    const request: RefillRequest = {
      id: `refill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      prescriptionId,
      requestedAt: new Date().toISOString(),
      requestedBy,
      status: autoApprove ? 'auto_approved' : 'pending',
    };

    this.refillRequests.push(request);
    if (autoApprove) {
      rx.refillsUsed += 1;
      rx.updatedAt = new Date().toISOString();
    }
    this.recordAudit(prescriptionId, 'refill_requested', requestedBy, { autoApprove });
    return request;
  }

  approveRefill(refillId: string, approverId: string): RefillRequest {
    const request = this.refillRequests.find((r) => r.id === refillId);
    if (!request) throw new Error('Refill request not found');
    const rx = this.mustFind(request.prescriptionId);
    request.status = 'approved';
    rx.refillsUsed += 1;
    rx.updatedAt = new Date().toISOString();
    this.recordAudit(rx.id, 'refill_approved', approverId, { refillId });
    return request;
  }

  /** Expiration tracking — sweeps all prescriptions and flags stale ones. */
  sweepExpirations(): PrescriptionRecord[] {
    const expired: PrescriptionRecord[] = [];
    for (const rx of this.prescriptions.values()) {
      if (this.isExpired(rx) && rx.status !== 'expired') {
        rx.status = 'expired';
        rx.updatedAt = new Date().toISOString();
        this.recordAudit(rx.id, 'expired', 'system');
        expired.push(rx);
      }
    }
    return expired;
  }

  private isExpired(rx: PrescriptionRecord): boolean {
    return new Date(rx.expiresAt).getTime() < Date.now();
  }

  /** Regulatory compliance checking (quantity limits, days supply, schedule rules). */
  runComplianceCheck(prescriptionId: string): { compliant: boolean; violations: string[] } {
    const rx = this.mustFind(prescriptionId);
    const violations: string[] = [];

    if (rx.isControlledSubstance && rx.refillsAllowed > 5) {
      violations.push('Controlled substance refills exceed regulatory maximum of 5');
    }
    if (rx.deaScheduleClass === 'II' && rx.refillsAllowed > 0) {
      violations.push('Schedule II substances may not have refills');
    }
    if (rx.daysSupply > 90) {
      violations.push('Days supply exceeds standard 90-day regulatory limit');
    }
    if (rx.quantity <= 0) {
      violations.push('Quantity must be a positive value');
    }

    this.recordAudit(prescriptionId, 'compliance_checked', 'system', { violations });
    return { compliant: violations.length === 0, violations };
  }

  /** Heuristic fraud detection scoring; flags prescriptions above threshold for review. */
  runFraudDetection(prescriptionId: string): number {
    const rx = this.mustFind(prescriptionId);
    let score = 0;

    const patientHistory = this.getHistory(rx.patientId);
    const recentSameMed = patientHistory.filter(
      (p) => p.medicationCode === rx.medicationCode && p.id !== rx.id,
    );
    if (recentSameMed.length > 2) score += 0.3;
    if (rx.isControlledSubstance) score += 0.2;
    if (rx.quantity > 120) score += 0.25;
    if (rx.refillsAllowed > 3 && rx.isControlledSubstance) score += 0.35;

    const uniquePrescribers = new Set(patientHistory.map((p) => p.prescriberId));
    if (uniquePrescribers.size > 3) score += 0.2;

    score = Math.min(1, score);
    rx.fraudScore = score;
    if (score >= FRAUD_SCORE_THRESHOLD) {
      this.recordAudit(prescriptionId, 'fraud_flagged', 'system', { score });
    }
    return score;
  }

  /** Full chronological prescription history for a patient. */
  getHistory(patientId: string): PrescriptionRecord[] {
    return Array.from(this.prescriptions.values())
      .filter((rx) => rx.patientId === patientId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getAuditTrail(prescriptionId: string): PrescriptionAuditEntry[] {
    return this.auditTrail.filter((e) => e.prescriptionId === prescriptionId);
  }

  /** Aggregate analytics across all tracked prescriptions. */
  getAnalytics(): {
    total: number;
    byStatus: Record<PrescriptionStatus, number>;
    fraudFlagged: number;
    controlledSubstanceRate: number;
  } {
    const all = Array.from(this.prescriptions.values());
    const byStatus = all.reduce(
      (acc, rx) => {
        acc[rx.status] = (acc[rx.status] || 0) + 1;
        return acc;
      },
      {} as Record<PrescriptionStatus, number>,
    );

    return {
      total: all.length,
      byStatus,
      fraudFlagged: all.filter((rx) => (rx.fraudScore ?? 0) >= FRAUD_SCORE_THRESHOLD).length,
      controlledSubstanceRate: all.length
        ? all.filter((rx) => rx.isControlledSubstance).length / all.length
        : 0,
    };
  }

  private mustFind(id: string): PrescriptionRecord {
    const rx = this.prescriptions.get(id);
    if (!rx) throw new Error(`Prescription ${id} not found`);
    return rx;
  }

  private recordAudit(
    prescriptionId: string,
    action: string,
    actorId: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.auditTrail.push({
      prescriptionId,
      action,
      actorId,
      timestamp: new Date().toISOString(),
      metadata,
    });
  }
}

export const prescriptionEngine = new PrescriptionEngine();
