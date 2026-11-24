import { Router } from 'express';
import { appointmentRoutes as v2AppointmentRoutes } from './appointments.routes';
import { patientRoutes as v2PatientRoutes } from './patients.routes';

export const v2Router = Router();

// V2 routes with breaking changes
v2Router.use('/appointments', v2AppointmentRoutes);
v2Router.use('/patients', v2PatientRoutes);

// Add other v2 routes here as needed
// v2Router.use('/encounters', v2EncounterRoutes);
