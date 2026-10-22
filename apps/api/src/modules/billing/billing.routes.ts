import { Router } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { authorize, Roles } from '@api/middlewares/rbac.middleware';
import {
  generateClaim,
  listClaims,
  getClaimCounts,
  getClaim,
  submitClaims,
  denyClaim,
  resubmitClaim,
  writeOffClaim,
  addClaimAttachment,
} from './claim.controller';
import {
  downloadCms1500,
  validateClaimPayload,
  validateStoredClaim,
  transitionClaimStatus,
  recordRemittance,
  syncClaimStatus,
  syncOpenClaims,
  correctClaim,
  getEraDashboard,
} from './claim-lifecycle.controller';
import {
  getUnbilledEncounters,
  getDeniedEncounters,
  getAgingReport,
  getBillingSummary,
} from './billing-queries.controller';
import { insuranceVerificationRoutes } from './insurance-verification.controller';
import { billingCodeRoutes } from './billing-code.controller';
import { creditNoteRoutes } from './credit-note.controller';

/** Roles allowed to read billing data (billing & admin roles) */
const BILLING_READ_ROLES = [
  Roles.SUPER_ADMIN,
  Roles.CLINIC_ADMIN,
  Roles.DOCTOR,
];

/** Roles allowed to mutate billing/claims state */
const BILLING_WRITE_ROLES = [
  Roles.SUPER_ADMIN,
  Roles.CLINIC_ADMIN,
];

/**
 * /billing — billing workflow (Issue #1245, updated #1428, #1429)
 *
 *  POST /billing/encounters/:id/generate-claim   Generate CMS-1500 + EDI 837 claim
 *  GET  /billing/claims                          List insurance claims (?status=a,b)
 *  GET  /billing/claims/counts                   Per-status queue totals (+ unbilled)
 *  POST /billing/claims/submit                   Bulk-submit draft claims
 *  GET  /billing/claims/:claimId                 Claim detail
 *  POST /billing/claims/validate                 Validate CMS-1500 fields before generating (#1689)
 *  POST /billing/claims/sync                     Poll the clearinghouse for every open claim (#1689)
 *  GET  /billing/claims/era                      ERA (835) remittance dashboard (#1689)
 *  GET  /billing/claims/:claimId/cms1500.pdf     CMS-1500 claim form as PDF (#1689)
 *  GET  /billing/claims/:claimId/validation      Re-validate a stored claim (#1689)
 *  PATCH /billing/claims/:claimId/status         State-machine status update (#1689)
 *  PATCH /billing/claims/:claimId/correct        Correct a draft/rejected/denied claim (#1689)
 *  POST /billing/claims/:claimId/remittances     Post an ERA remittance (#1689)
 *  POST /billing/claims/:claimId/sync            Poll the clearinghouse for one claim (#1689)
 *  PATCH /billing/claims/:claimId/deny           Record a payer denial
 *  PATCH /billing/claims/:claimId/resubmit       Correct & resubmit a rejected/denied claim
 *  PATCH /billing/claims/:claimId/write-off      Write off with reason
 *  POST /billing/claims/:claimId/attachments     Link a supporting document
 *  GET  /billing/unbilled                        Unbilled encounters (paginated, sortable) [RBAC]
 *  GET  /billing/denied                          Denied encounters (paginated, sortable)  [RBAC]
 *  GET  /billing/queries/unbilled-encounters     Encounters awaiting billing (legacy)
 *  GET  /billing/queries/denied-encounters       Denied encounters (legacy)
 *  GET  /billing/queries/aging-report            Unbilled AR aging buckets
 *  GET  /billing/queries/summary                 Billing summary report
 *  /billing/insurance-verification               Insurance eligibility checks
 *  /billing/codes                                CPT + SNOMED code assignment
 *  /billing/credit-notes                         Credit note workflow
 */
const router = Router();
router.use(authenticate);

// ── Issue #1428: Billing Workbench endpoints (paginated + RBAC) ───────────────
router.get('/unbilled', authorize(BILLING_READ_ROLES), getUnbilledEncounters);
router.get('/denied', authorize(BILLING_READ_ROLES), getDeniedEncounters);

// ── Claims ────────────────────────────────────────────────────────────────────
router.post('/encounters/:id/generate-claim', authorize(BILLING_WRITE_ROLES), generateClaim);
router.get('/claims', authorize(BILLING_READ_ROLES), listClaims);
router.get('/claims/counts', authorize(BILLING_READ_ROLES), getClaimCounts);
router.post('/claims/submit', authorize(BILLING_WRITE_ROLES), submitClaims);
router.post('/claims/validate', authorize(BILLING_READ_ROLES), validateClaimPayload);
router.post('/claims/sync', authorize(BILLING_WRITE_ROLES), syncOpenClaims);
router.get('/claims/era', authorize(BILLING_READ_ROLES), getEraDashboard);
router.get('/claims/:claimId', authorize(BILLING_READ_ROLES), getClaim);
router.get('/claims/:claimId/cms1500.pdf', authorize(BILLING_READ_ROLES), downloadCms1500);
router.get('/claims/:claimId/validation', authorize(BILLING_READ_ROLES), validateStoredClaim);
router.patch('/claims/:claimId/status', authorize(BILLING_WRITE_ROLES), transitionClaimStatus);
router.patch('/claims/:claimId/correct', authorize(BILLING_WRITE_ROLES), correctClaim);
router.post('/claims/:claimId/remittances', authorize(BILLING_WRITE_ROLES), recordRemittance);
router.post('/claims/:claimId/sync', authorize(BILLING_WRITE_ROLES), syncClaimStatus);
router.patch('/claims/:claimId/deny', authorize(BILLING_WRITE_ROLES), denyClaim);
router.patch('/claims/:claimId/resubmit', authorize(BILLING_WRITE_ROLES), resubmitClaim);
router.patch('/claims/:claimId/write-off', authorize(BILLING_WRITE_ROLES), writeOffClaim);
router.post('/claims/:claimId/attachments', authorize(BILLING_READ_ROLES), addClaimAttachment);

// ── Billing queries & reports (legacy paths + new RBAC) ─────────────────────
router.get('/queries/unbilled-encounters', authorize(BILLING_READ_ROLES), getUnbilledEncounters);
router.get('/queries/denied-encounters', authorize(BILLING_READ_ROLES), getDeniedEncounters);
router.get('/queries/aging-report', authorize(BILLING_READ_ROLES), getAgingReport);
router.get('/queries/summary', authorize(BILLING_READ_ROLES), getBillingSummary);

// ── Sub-modules ───────────────────────────────────────────────────────────────
router.use('/insurance-verification', insuranceVerificationRoutes);
router.use('/codes', billingCodeRoutes);
router.use('/credit-notes', creditNoteRoutes);

export const billingRoutes = router;
