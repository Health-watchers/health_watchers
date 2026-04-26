import { z } from 'zod';

export const emergencyContactSchema = z.object({
  name: z.string().min(1).max(100),
  relationship: z.string().min(1).max(50),
  phone: z.string().min(5).max(20),
  email: z.string().email().optional(),
  address: z.string().max(200).optional(),
  isPrimary: z.boolean().default(false),
});

export const createEmergencyContactSchema = emergencyContactSchema;

export const updateEmergencyContactSchema = emergencyContactSchema.partial();
