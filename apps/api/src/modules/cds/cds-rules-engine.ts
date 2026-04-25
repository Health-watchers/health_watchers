import { CDSRuleModel, CDSAlert, AlertSeverity } from './cds-rule.model.js';
import { PatientModel } from '../patients/models/patient.model.js';
import { EncounterModel, VitalSigns, Prescription } from '../encounters/encounter.model.js';
import logger from '@api/utils/logger';
import { Schema } from 'mongoose';

interface RuleEvaluationContext {
  patientId: Schema.Types.ObjectId;
  clinicId: Schema.Types.ObjectId;
  vitalSigns?: VitalSigns;
  prescription?: Prescription;
  patientAge?: number;
  patientSex?: string;
  allergies?: Array<{ allergen: string; severity: string }>;
}

class CDSRulesEngine {
  /**
   * Evaluate all applicable rules for an event
   */
  async evaluateRules(
    trigger: 'encounter_create' | 'prescription_add' | 'vital_sign_record',
    context: RuleEvaluationContext
  ): Promise<CDSAlert[]> {
    const startTime = Date.now();
    const alerts: CDSAlert[] = [];

    try {
      // Get applicable rules (global + clinic-specific)
      const rules = await CDSRuleModel.find({
        trigger,
        isActive: true,
        $or: [{ clinicId: null }, { clinicId: context.clinicId }],
      });

      // Evaluate each rule
      for (const rule of rules) {
        const matches = this.evaluateConditions(rule.conditions, context);
        if (matches) {
          alerts.push({
            ruleId: rule.ruleId,
            severity: rule.action.severity,
            message: rule.action.message,
            action: rule.action.type,
          });
        }
      }

      const elapsed = Date.now() - startTime;
      logger.info(
        { trigger, alertCount: alerts.length, elapsed },
        'CDS rules evaluated'
      );

      return alerts;
    } catch (error) {
      logger.error({ error, trigger }, 'Error evaluating CDS rules');
      return [];
    }
  }

  /**
   * Evaluate rule conditions against context
   */
  private evaluateConditions(conditions: Record<string, unknown>, context: RuleEvaluationContext): boolean {
    // Vital sign rules
    if (conditions.type === 'vital_sign') {
      return this.evaluateVitalSignRule(conditions, context.vitalSigns);
    }

    // Drug interaction rules
    if (conditions.type === 'drug_interaction') {
      return this.evaluateDrugInteractionRule(conditions, context.prescription, context.allergies);
    }

    // Screening/care gap rules
    if (conditions.type === 'screening') {
      return this.evaluateScreeningRule(conditions, context.patientAge, context.patientSex);
    }

    // Allergy rules
    if (conditions.type === 'allergy') {
      return this.evaluateAllergyRule(conditions, context.prescription, context.allergies);
    }

    return false;
  }

  /**
   * Evaluate vital sign conditions
   */
  private evaluateVitalSignRule(conditions: Record<string, unknown>, vitalSigns?: VitalSigns): boolean {
    if (!vitalSigns) return false;

    const { bloodPressure, heartRate, temperature, oxygenSaturation } = conditions as any;

    // Blood pressure checks
    if (bloodPressure) {
      const [systolic, diastolic] = (vitalSigns.bloodPressure || '').split('/').map(Number);
      if (bloodPressure.critical && systolic > 180 && diastolic > 120) return true;
      if (bloodPressure.warning && systolic > 140 && diastolic > 90) return true;
    }

    // Heart rate checks
    if (heartRate) {
      if (heartRate.critical && (vitalSigns.heartRate! > 150 || vitalSigns.heartRate! < 40)) return true;
    }

    // Temperature checks
    if (temperature) {
      if (temperature.warning && vitalSigns.temperature! > 39) return true;
    }

    // Oxygen saturation checks
    if (oxygenSaturation) {
      if (oxygenSaturation.critical && vitalSigns.oxygenSaturation! < 90) return true;
    }

    return false;
  }

  /**
   * Evaluate drug interaction conditions
   */
  private evaluateDrugInteractionRule(
    conditions: Record<string, unknown>,
    prescription?: Prescription,
    allergies?: Array<{ allergen: string; severity: string }>
  ): boolean {
    if (!prescription) return false;

    const { contraindications } = conditions as any;
    if (!contraindications) return false;

    // Check if drug is in contraindications list
    const drugName = prescription.drugName.toLowerCase();
    return contraindications.some((drug: string) => drug.toLowerCase() === drugName);
  }

  /**
   * Evaluate screening/care gap conditions
   */
  private evaluateScreeningRule(
    conditions: Record<string, unknown>,
    patientAge?: number,
    patientSex?: string
  ): boolean {
    const { screeningType, minAge, maxAge, requiredSex } = conditions as any;

    if (!patientAge) return false;

    // Age checks
    if (minAge && patientAge < minAge) return false;
    if (maxAge && patientAge > maxAge) return false;

    // Sex checks
    if (requiredSex && patientSex !== requiredSex) return false;

    return true;
  }

  /**
   * Evaluate allergy conditions
   */
  private evaluateAllergyRule(
    conditions: Record<string, unknown>,
    prescription?: Prescription,
    allergies?: Array<{ allergen: string; severity: string }>
  ): boolean {
    if (!prescription || !allergies || allergies.length === 0) return false;

    const { allergenType } = conditions as any;
    if (allergenType !== 'drug') return false;

    // Check if prescribed drug matches any known allergies
    const drugName = prescription.drugName.toLowerCase();
    return allergies.some(
      allergy =>
        allergy.allergen.toLowerCase() === drugName &&
        allergy.severity !== 'mild'
    );
  }

  /**
   * Get patient context for rule evaluation
   */
  async getPatientContext(
    patientId: Schema.Types.ObjectId,
    clinicId: Schema.Types.ObjectId
  ): Promise<Partial<RuleEvaluationContext>> {
    try {
      const patient = await PatientModel.findById(patientId);
      if (!patient) return {};

      const birthDate = new Date(patient.dateOfBirth);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();

      return {
        patientAge: age,
        patientSex: patient.sex,
        allergies: patient.allergies
          .filter(a => a.isActive)
          .map(a => ({
            allergen: a.allergen,
            severity: a.severity,
          })),
      };
    } catch (error) {
      logger.error({ error, patientId }, 'Error getting patient context');
      return {};
    }
  }
}

export default new CDSRulesEngine();
