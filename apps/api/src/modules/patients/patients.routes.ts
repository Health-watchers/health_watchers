import { Router } from 'express';
import { patientRoutes } from './patients.controller';
import { patientsSearchRouter } from './patients-search.router';
import { medicalHistoryRoutes } from './medical-history.controller';
import { patientPhotoRoutes } from './photo.controller';

const router = Router();

// Split routers for improved organization (Issue #1515)
router.use('/', patientsSearchRouter);

// Existing controllers
router.use('/', medicalHistoryRoutes);
router.use('/', patientPhotoRoutes);
router.use('/', patientRoutes);

export default router;
