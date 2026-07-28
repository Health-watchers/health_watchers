import { Router } from 'express';
import { protect } from '../../middleware/auth';
import { parseLazyLoadQuery } from '../../middleware/lazy-load.middleware';
import { getEncounterRelation, getMultipleEncounterRelations } from './encounter-lazy-load.controller';

const router = Router({ mergeParams: true });

router.use(protect);
router.use(parseLazyLoadQuery);

// Load a single relationship on-demand
router.get('/:encounterId/relation/:relation', getEncounterRelation);

// Load multiple relationships at once
router.get('/:encounterId/relations', getMultipleEncounterRelations);

export default router;
