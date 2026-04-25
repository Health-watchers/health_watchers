import { CDSRuleModel } from './cds-rule.model.js';
import logger from '@api/utils/logger';

export async function seedBuiltInRules(): Promise<void> {
  try {
    const existingCount = await CDSRuleModel.countDocuments();
    if (existingCount > 0) {
      logger.info('Built-in CDS rules already seeded');
      return;
    }

    const builtInRules = [
      // Critical vital sign rules
      {
        ruleId: 'vital_bp_critical',
        name: 'Critical Blood Pressure',
        description: 'Blood pressure > 180/120 mmHg',
        category: 'vital_sign',
        trigger: 'vital_sign_record',
        conditions: {
          type: 'vital_sign',
          bloodPressure: { critical: true },
        },
        action: {
          type: 'alert',
          message: 'CRITICAL: Blood pressure > 180/120 mmHg. Immediate intervention required.',
          severity: 'critical',
        },
        isActive: true,
      },
      {
        ruleId: 'vital_bp_warning',
        name: 'Elevated Blood Pressure',
        description: 'Blood pressure > 140/90 mmHg',
        category: 'vital_sign',
        trigger: 'vital_sign_record',
        conditions: {
          type: 'vital_sign',
          bloodPressure: { warning: true },
        },
        action: {
          type: 'alert',
          message: 'WARNING: Blood pressure > 140/90 mmHg. Consider intervention.',
          severity: 'warning',
        },
        isActive: true,
      },
      {
        ruleId: 'vital_hr_critical',
        name: 'Critical Heart Rate',
        description: 'Heart rate > 150 or < 40 bpm',
        category: 'vital_sign',
        trigger: 'vital_sign_record',
        conditions: {
          type: 'vital_sign',
          heartRate: { critical: true },
        },
        action: {
          type: 'alert',
          message: 'CRITICAL: Heart rate abnormal (>150 or <40 bpm). Immediate evaluation needed.',
          severity: 'critical',
        },
        isActive: true,
      },
      {
        ruleId: 'vital_temp_warning',
        name: 'High Temperature',
        description: 'Temperature > 39°C',
        category: 'vital_sign',
        trigger: 'vital_sign_record',
        conditions: {
          type: 'vital_sign',
          temperature: { warning: true },
        },
        action: {
          type: 'alert',
          message: 'WARNING: Temperature > 39°C. Monitor closely.',
          severity: 'warning',
        },
        isActive: true,
      },
      {
        ruleId: 'vital_o2_critical',
        name: 'Low Oxygen Saturation',
        description: 'Oxygen saturation < 90%',
        category: 'vital_sign',
        trigger: 'vital_sign_record',
        conditions: {
          type: 'vital_sign',
          oxygenSaturation: { critical: true },
        },
        action: {
          type: 'alert',
          message: 'CRITICAL: Oxygen saturation < 90%. Immediate oxygen therapy may be needed.',
          severity: 'critical',
        },
        isActive: true,
      },
      // Screening recommendations
      {
        ruleId: 'screening_mammogram',
        name: 'Overdue Mammogram',
        description: 'Female age 40+ without recent mammogram',
        category: 'screening',
        trigger: 'encounter_create',
        conditions: {
          type: 'screening',
          screeningType: 'mammogram',
          minAge: 40,
          requiredSex: 'F',
        },
        action: {
          type: 'recommendation',
          message: 'RECOMMENDATION: Patient is due for mammogram screening.',
          severity: 'info',
        },
        isActive: true,
      },
      {
        ruleId: 'screening_colorectal',
        name: 'Overdue Colorectal Screening',
        description: 'Age 50+ without recent colorectal screening',
        category: 'screening',
        trigger: 'encounter_create',
        conditions: {
          type: 'screening',
          screeningType: 'colorectal',
          minAge: 50,
        },
        action: {
          type: 'recommendation',
          message: 'RECOMMENDATION: Patient is due for colorectal cancer screening.',
          severity: 'info',
        },
        isActive: true,
      },
    ];

    await CDSRuleModel.insertMany(builtInRules);
    logger.info({ count: builtInRules.length }, 'Built-in CDS rules seeded');
  } catch (error) {
    logger.error({ error }, 'Error seeding built-in CDS rules');
    throw error;
  }
}
