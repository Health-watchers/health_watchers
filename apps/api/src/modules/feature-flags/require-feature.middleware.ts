import { Request, Response, NextFunction } from 'express';
import { featureFlagsService } from './feature-flags.service';

export const requireFeature =
  (flagKey: string) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isEnabled = await featureFlagsService.isEnabled(flagKey, {
        userId: req.user?.userId,
        clinicId: req.user?.clinicId,
      });

      if (!isEnabled) {
        return res.status(403).json({ error: `Feature '${flagKey}' is not enabled for your clinic` });
      }

      next();
    } catch (error) {
      return res.status(500).json({ error: String(error) });
    }
  };
