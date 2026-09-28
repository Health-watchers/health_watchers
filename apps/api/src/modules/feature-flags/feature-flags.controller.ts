import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { FeatureFlagModel } from './feature-flag.model';
import { featureFlagsService } from './feature-flags.service';
import { authenticate } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { z } from 'zod';

export const featureFlagsRoutes = Router();
featureFlagsRoutes.use(authenticate);

const createFlagSchema = z.object({
  body: z.object({
    key: z.string().lowercase().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    default: z.boolean().default(false),
    enabled: z.boolean().default(false),
    rolloutPercentage: z.number().min(0).max(100).default(0),
  }),
});

const updateFlagSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    enabled: z.boolean().optional(),
    rolloutPercentage: z.number().min(0).max(100).optional(),
    clinicOverrides: z
      .array(
        z.object({
          clinicId: z.string(),
          enabled: z.boolean(),
          rolloutPercentage: z.number().min(0).max(100),
        })
      )
      .optional(),
  }),
});

// GET /feature-flags - User gets flags for their clinic
featureFlagsRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const flags = await featureFlagsService.getAllFlags(req.user?.clinicId);
    return res.json({ flags });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});

// GET /feature-flags/:key - Check if a flag is enabled
featureFlagsRoutes.get('/:key', async (req: Request, res: Response) => {
  try {
    const isEnabled = await featureFlagsService.isEnabled(req.params.key, {
      userId: req.user?.userId,
      clinicId: req.user?.clinicId,
    });

    return res.json({ key: req.params.key, enabled: isEnabled });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});

// ADMIN ENDPOINTS
const requireAdmin = (req: Request, res: Response, next: any) => {
  if (req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Only admins can manage flags' });
  }
  next();
};

featureFlagsRoutes.use('/admin', requireAdmin);

// POST /feature-flags/admin/create - Create new flag
featureFlagsRoutes.post(
  '/admin/create',
  validateRequest(createFlagSchema),
  async (req: Request, res: Response) => {
    try {
      const existing = await FeatureFlagModel.findOne({ key: req.body.key });
      if (existing) {
        return res.status(409).json({ error: 'Flag already exists' });
      }

      const flag = await FeatureFlagModel.create({
        key: req.body.key,
        name: req.body.name,
        description: req.body.description,
        default: req.body.default,
        enabled: req.body.enabled,
        rolloutPercentage: req.body.rolloutPercentage,
        createdBy: new Types.ObjectId(req.user?.userId),
      });

      return res.status(201).json(flag);
    } catch (error) {
      return res.status(500).json({ error: String(error) });
    }
  }
);

// PATCH /feature-flags/admin/:key - Update flag
featureFlagsRoutes.patch(
  '/admin/:key',
  validateRequest(updateFlagSchema),
  async (req: Request, res: Response) => {
    try {
      const updateData: any = { updatedBy: new Types.ObjectId(req.user?.userId) };

      if (req.body.name !== undefined) updateData.name = req.body.name;
      if (req.body.description !== undefined) updateData.description = req.body.description;
      if (req.body.enabled !== undefined) updateData.enabled = req.body.enabled;
      if (req.body.rolloutPercentage !== undefined)
        updateData.rolloutPercentage = req.body.rolloutPercentage;
      if (req.body.clinicOverrides !== undefined) {
        updateData.clinicOverrides = req.body.clinicOverrides.map((o: any) => ({
          clinicId: new Types.ObjectId(o.clinicId),
          enabled: o.enabled,
          rolloutPercentage: o.rolloutPercentage,
        }));
      }

      const flag = await FeatureFlagModel.findOneAndUpdate(
        { key: req.params.key },
        updateData,
        { new: true }
      );

      if (!flag) {
        return res.status(404).json({ error: 'Flag not found' });
      }

      // Invalidate cache
      await featureFlagsService.invalidateCache(req.params.key);

      return res.json(flag);
    } catch (error) {
      return res.status(500).json({ error: String(error) });
    }
  }
);

// DELETE /feature-flags/admin/:key - Delete flag
featureFlagsRoutes.delete('/admin/:key', async (req: Request, res: Response) => {
  try {
    const flag = await FeatureFlagModel.findOneAndDelete({ key: req.params.key });

    if (!flag) {
      return res.status(404).json({ error: 'Flag not found' });
    }

    await featureFlagsService.invalidateCache(req.params.key);

    return res.json({ message: 'Flag deleted' });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});
