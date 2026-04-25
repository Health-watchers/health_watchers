import { Router, Request, Response } from 'express';
import { CDSRuleModel, CDSAlert } from './cds-rule.model.js';
import cdsRulesEngine from './cds-rules-engine.js';
import logger from '@api/utils/logger';
import { Schema } from 'mongoose';

const router = Router();

/**
 * GET /cds/rules - List all CDS rules
 */
router.get('/rules', async (req: Request, res: Response) => {
  try {
    const { clinicId, isActive } = req.query;
    const filter: Record<string, unknown> = {};

    if (clinicId) {
      filter.$or = [
        { clinicId: null },
        { clinicId: new Schema.Types.ObjectId(clinicId as string) },
      ];
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    const rules = await CDSRuleModel.find(filter).sort({ createdAt: -1 });
    return res.json({ success: true, data: rules });
  } catch (error: any) {
    logger.error({ error }, 'Error fetching CDS rules');
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /cds/rules - Create a new CDS rule
 */
router.post('/rules', async (req: Request, res: Response) => {
  try {
    const { ruleId, name, description, category, trigger, conditions, action, clinicId } = req.body;

    if (!ruleId || !name || !category || !trigger || !conditions || !action) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const rule = new CDSRuleModel({
      ruleId,
      name,
      description,
      category,
      trigger,
      conditions,
      action,
      clinicId: clinicId ? new Schema.Types.ObjectId(clinicId) : null,
      isActive: true,
    });

    await rule.save();
    logger.info({ ruleId }, 'CDS rule created');
    return res.status(201).json({ success: true, data: rule });
  } catch (error: any) {
    logger.error({ error }, 'Error creating CDS rule');
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /cds/rules/:ruleId - Update a CDS rule
 */
router.put('/rules/:ruleId', async (req: Request, res: Response) => {
  try {
    const { ruleId } = req.params;
    const updates = req.body;

    const rule = await CDSRuleModel.findOneAndUpdate({ ruleId }, updates, { new: true });
    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    logger.info({ ruleId }, 'CDS rule updated');
    return res.json({ success: true, data: rule });
  } catch (error: any) {
    logger.error({ error }, 'Error updating CDS rule');
    return res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /cds/rules/:ruleId - Delete a CDS rule
 */
router.delete('/rules/:ruleId', async (req: Request, res: Response) => {
  try {
    const { ruleId } = req.params;

    const result = await CDSRuleModel.deleteOne({ ruleId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    logger.info({ ruleId }, 'CDS rule deleted');
    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ error }, 'Error deleting CDS rule');
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /cds/evaluate - Evaluate rules for an encounter
 */
router.post('/evaluate', async (req: Request, res: Response) => {
  try {
    const { trigger, patientId, clinicId, vitalSigns, prescription } = req.body;

    if (!trigger || !patientId || !clinicId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const patientObjectId = new Schema.Types.ObjectId(patientId);
    const clinicObjectId = new Schema.Types.ObjectId(clinicId);

    // Get patient context
    const patientContext = await cdsRulesEngine.getPatientContext(patientObjectId, clinicObjectId);

    // Evaluate rules
    const alerts = await cdsRulesEngine.evaluateRules(trigger, {
      patientId: patientObjectId,
      clinicId: clinicObjectId,
      vitalSigns,
      prescription,
      ...patientContext,
    });

    return res.json({ success: true, alerts });
  } catch (error: any) {
    logger.error({ error }, 'Error evaluating CDS rules');
    return res.status(500).json({ error: error.message });
  }
});

export default router;
