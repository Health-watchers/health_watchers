/**
 * V1 API Route Groups
 *
 * All v1 API routes are organized into logical domain groups:
 *
 * ┌─────────────────┬──────────────────────────────────────────────────┐
 * │ Group           │ Routes                                           │
 * ├─────────────────┼──────────────────────────────────────────────────┤
 * │ auth            │ /auth, /users, /portal (MFA)                     │
 * │ clinical        │ /patients, /encounters, /appointments,           │
 * │                 │ /lab-results, /immunizations, /care-plans,       │
 * │                 │ /referrals, /medications, /schedules, /cds,      │
 * │                 │ /peer-reviews, /pre-auth, /icd10, /reports,     │
 * │                 │ /consent, /ai, /dashboard, /portal, /surveys     │
 * │ payments        │ /payments, /invoices, /subscriptions,            │
 * │                 │ /billing, /export                                │
 * │ admin           │ /clinics, /onboarding, /settings, /api-keys,    │
 * │                 │ /webhooks, /compliance, /breach-incidents,       │
 * │                 │ /audit, /audit-logs, /notifications,             │
 * │                 │ /documents, /security/csp-report                 │
 * │ infrastructure  │ /cdn, /replication                              │
 * │ system          │ /metrics, /federation (well-known), /health      │
 * └─────────────────┴──────────────────────────────────────────────────┘
 */

import { Router } from 'express';
import {
  authLimiter,
  forgotPasswordLimiter,
  aiLimiter,
  paymentLimiter,
  bulkExportLimiter,
  patientSearchLimiter,
  reportGenerationLimiter,
} from '../../middlewares/rate-limit.middleware';
import express from 'express';

// ── Auth ──────────────────────────────────────────────────────────────────────
import { authRoutes } from '../../modules/auth/auth.controller';
import { userRoutes } from '../../modules/users/users.controller';
import { userManagementRoutes } from '../../modules/users/user-management.controller';

// ── Clinical ──────────────────────────────────────────────────────────────────
import { patientRoutes } from '../../modules/patients/patients.controller';
import { medicalHistoryRoutes } from '../../modules/patients/medical-history.controller';
import { patientPhotoRoutes } from '../../modules/patients/photo.controller';
import { encounterRoutes } from '../../modules/encounters/encounters.controller';
import { encounterTemplateRoutes } from '../../modules/encounters/encounter-templates.controller';
import { appointmentRoutes } from '../../modules/appointments/appointments.controller';
import { waitlistRoutes } from '../../modules/appointments/waitlist.controller';
import { labResultRoutes } from '../../modules/lab-results/lab-results.controller';
import { icd10Routes } from '../../modules/icd10/icd10.controller';
import { carePlanRoutes } from '../../modules/care-plans/care-plans.controller';
import { referralRoutes } from '../../modules/referrals/referrals.controller';
import { consentRoutes } from '../../modules/consent/consent.controller';
import {
  immunizationRoutes,
  cvxCodesRouter,
} from '../../modules/immunizations/immunizations.controller';
import { reportRoutes } from '../../modules/reports/reports.controller';
import {
  healthLogRouter,
  patientHealthLogRouter,
} from '../../modules/health-log/health-log.controller';
import aiRoutes from '../../modules/ai/ai.routes';
import dashboardRoutes from '../../modules/dashboard/dashboard.routes';
import { portalRoutes } from '../../modules/portal/portal.controller';
import scheduleRoutes from '../../modules/schedules/schedules.routes';
import cdsRoutes from '../../modules/cds/cds.controller';
import { preAuthRoutes } from '../../modules/pre-auth/pre-auth.controller';
import peerReviewsRouter from '../../modules/peer-reviews/peer-reviews.router';

// ── Payments ──────────────────────────────────────────────────────────────────
import paymentsRouter from '../../modules/payments/payments.routes';
import { reimbursementRoutes } from '../../modules/payments/reimbursement.controller';
import { invoiceRoutes } from '../../modules/invoices/invoices.controller';
import { subscriptionRoutes } from '../../modules/subscriptions/subscriptions.controller';
import { billingRoutes } from '../../modules/billing/billing.routes';
import exportRouter from '../../modules/export/export.routes';
import batchExportRouter from '../../modules/export/batch-export.routes';

// ── Admin ─────────────────────────────────────────────────────────────────────
import { clinicRoutes } from '../../modules/clinics/clinics.controller';
import { clinicSettingsRoutes } from '../../modules/clinics/clinic-settings.controller';
import onboardingRoutes from '../../modules/clinics/onboarding.routes';
import apiKeyRoutes from '../../modules/api-keys/api-keys.routes';
import { webhookRoutes } from '../../modules/webhooks/webhooks.controller';
import { auditLogRoutes } from '../../modules/audit/audit-logs.controller';
import { auditRoutes } from '../../modules/audit/audit.controller';
import { documentRoutes } from '../../modules/documents/documents.controller';
import { notificationRoutes } from '../../modules/notifications/notifications.controller';
import { complianceRoutes } from '../../modules/compliance/compliance.controller';
import { breachIncidentRoutes } from '../../modules/breach-incidents/breach-incidents.controller';
import { cspReportRoutes } from '../../modules/security/csp-report.controller';

// ── System / Infrastructure ───────────────────────────────────────────────────
import federationRouter from '../../modules/federation/federation.router';
import { comprehensiveHealthRoutes } from '../../modules/health/comprehensive-health.controller';

// ── Sharding (#1077) ──────────────────────────────────────────────────────────
import shardingRouter from '../../routes/sharding';

// ── CDN (#1078) ───────────────────────────────────────────────────────────────
import cdnCacheRouter from '../../routes/cdn/cache-invalidation';
import cdnHealthRouter from '../../routes/cdn/cdn-health';

// ── Replication (#1080) ───────────────────────────────────────────────────────
import replicationRouter from '../../routes/replication';

// Standard AI body size limit — configurable via AI_REQUEST_BODY_SIZE
const aiLimit = process.env.AI_REQUEST_BODY_SIZE ?? '50kb';

export const v1Router = Router();

// ── Auth group ────────────────────────────────────────────────────────────────
v1Router.use('/auth/forgot-password', forgotPasswordLimiter);
v1Router.use('/auth', authLimiter, authRoutes);
v1Router.use('/users', userManagementRoutes);
v1Router.use('/users', userRoutes);

// ── Clinical group ────────────────────────────────────────────────────────────
v1Router.use('/patients/search', patientSearchLimiter);
v1Router.use('/patients', patientRoutes);
v1Router.use('/patients', medicalHistoryRoutes);
v1Router.use('/patients', patientPhotoRoutes);
v1Router.use('/patients', patientHealthLogRouter);
v1Router.use('/patients/:id/immunizations', immunizationRoutes);
v1Router.use('/encounters', encounterRoutes);
v1Router.use('/encounter-templates', encounterTemplateRoutes);
v1Router.use('/appointments', appointmentRoutes);
v1Router.use('/waitlist', waitlistRoutes);
v1Router.use('/lab-results', labResultRoutes);
v1Router.use('/icd10', icd10Routes);
v1Router.use('/care-plans', carePlanRoutes);
v1Router.use('/referrals', referralRoutes);
// Consent routes define their own paths (e.g. /patients/:id/consent, /consent/:id/verify)
// so they are mounted at the root of v1 to preserve the existing URL structure.
v1Router.use('/', consentRoutes);
v1Router.use('/immunizations/cvx', cvxCodesRouter);
v1Router.use('/reports', reportGenerationLimiter, reportRoutes);
v1Router.use('/portal', portalRoutes);
v1Router.use('/portal', healthLogRouter);
v1Router.use('/schedules', scheduleRoutes);
v1Router.use('/cds', cdsRoutes);
v1Router.use('/pre-auth', paymentLimiter, preAuthRoutes);
v1Router.use('/peer-reviews', peerReviewsRouter);
v1Router.use('/ai', aiLimiter, express.json({ limit: aiLimit }), aiRoutes);
v1Router.use('/dashboard', dashboardRoutes);

// ── Payments group ────────────────────────────────────────────────────────────
v1Router.use('/payments', paymentLimiter, paymentsRouter);
v1Router.use('/payments', reimbursementRoutes);
v1Router.use('/invoices', invoiceRoutes);
v1Router.use('/subscriptions', subscriptionRoutes);
v1Router.use('/billing', billingRoutes);
// Export routes define their own paths (e.g. /patients/:id/export, /clinics/:id/export)
// so they are mounted at the root of v1 to preserve the existing URL structure.
v1Router.use('/', exportRouter);
// Batch export routes (#1072) — async job queue + SSE progress tracking
v1Router.use('/exports', batchExportRouter);

// ── Admin group ───────────────────────────────────────────────────────────────
v1Router.use('/clinics', clinicRoutes);
v1Router.use('/settings', clinicSettingsRoutes);
v1Router.use('/onboarding', onboardingRoutes);
v1Router.use('/api-keys', apiKeyRoutes);
v1Router.use('/webhooks', webhookRoutes);
v1Router.use('/audit-logs', auditLogRoutes);
v1Router.use('/audit', auditRoutes);
v1Router.use('/documents', documentRoutes);
v1Router.use('/notifications', notificationRoutes);
v1Router.use('/compliance', complianceRoutes);
v1Router.use('/admin/breach-incidents', breachIncidentRoutes);

// ── Security (no auth, no CSRF) ───────────────────────────────────────────────
v1Router.use('/csp-report', cspReportRoutes);

// ── Comprehensive Health Checks (no auth required) ───────────────────────────
v1Router.use('/health', comprehensiveHealthRoutes);

// ── Sharding admin (#1077) ────────────────────────────────────────────────────
v1Router.use('/sharding', shardingRouter);

// ── CDN management (#1078) ────────────────────────────────────────────────────
v1Router.use('/cdn', cdnCacheRouter);
v1Router.use('/cdn', cdnHealthRouter);

// ── Replication monitoring (#1080) ───────────────────────────────────────────
v1Router.use('/replication', replicationRouter);

// ── Federation / Stellar well-known (public) ──────────────────────────────────
// Note: /.well-known and /federation are mounted at root level in app.ts (not /api/v1)
// They are kept there to comply with Stellar federation protocol standards.
