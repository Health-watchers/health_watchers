import { z } from 'zod';

export const stellarPublicKey = z
  .string()
  .regex(/^G[A-Z2-7]{55}$/, 'Must be a valid Stellar public key (G + 55 base32 characters)');

export const mongoObjectId = z
  .string()
  .regex(/^[a-f0-9]{24}$/, 'Must be a valid MongoDB ObjectId (24 hex characters)');

export const icd10Code = z
  .string()
  .regex(/^[A-Z][0-9]{2}(\.[A-Z0-9]{1,4})?$/i, 'Must be a valid ICD-10 code (e.g. Z00.00, J45.901)');

export const cptCode = z
  .string()
  .regex(/^\d{5}(-[A-Z0-9]{2})?$/, 'Must be a valid CPT code (5 digits, optional -XX modifier)');

export const shortName = z.string().min(1).max(100).trim();
export const notesField = z.string().max(2000).trim().optional();
export const emailField = z.string().email().max(254).toLowerCase().trim();
export const phoneField = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, 'Must be a valid E.164 phone number (e.g. +2348012345678)')
  .optional();

export const monetaryAmount = z
  .number()
  .positive('Amount must be positive')
  .max(10_000_000, 'Amount exceeds maximum allowed value')
  .refine(
    n => Number((n * 100).toFixed(0)) === Math.round(n * 100),
    'Amount must have at most 2 decimal places',
  );

export const paginationLimit = z.number().int().min(1).max(100).default(20);
export const paginationOffset = z.number().int().min(0).default(0);
