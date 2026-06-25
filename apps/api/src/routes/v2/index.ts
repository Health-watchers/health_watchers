import { Router } from 'express';
import { appointmentRoutes as v2AppointmentRoutes } from './appointments.routes';

export const v2Router = Router();

// V2 routes with breaking changes
v2Router.use('/appointments', v2AppointmentRoutes);

// Add other v2 routes here as needed
// v2Router.use('/patients', v2PatientRoutes);
// v2Router.use('/encounters', v2EncounterRoutes);