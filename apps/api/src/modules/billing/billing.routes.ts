import { Router } from 'express';
import { authenticate } from '@api/middlewares/auth.middleware';
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
  getUnbilledEncounters,
  getDeniedEncounters,
  getAgingReport,
  getBillingSummary,
} from './billing-queries.controller';
import { insuranceVerificationRoutes } from './insurance-verification.controller';
import { billingCodeRoutes } from './billing-code.controller';
import { creditNoteRoutes } from './credit-note.controller';

/**
 * /billing — billing workflow (Issue #1245)
 *
 *  POST /billing/encounters/:id/generate-claim   Generate CMS-1500 + EDI 837 claim
 *  GET  /billing/claims                          List insurance claims (?status=a,b)
 *  GET  /billing/claims/counts                   Per-status queue totals (+ unbilled)
 *  POST /billing/claims/submit                   Bulk-submit draft claims
 *  GET  /billing/claims/:claimId                 Claim detail
 *  PATCH /billing/claims/:claimId/deny           Record a payer denial
 *  PATCH /billing/claims/:claimId/resubmit       Correct & resubmit a denied claim
 *  PATCH /billing/claims/:claimId/write-off      Write off with reason
 *  POST /billing/claims/:claimId/attachments     Link a supporting document
 *  GET  /billing/queries/unbilled-encounters     Encounters awaiting billing
 *  GET  /billing/queries/denied-encounters       Denied encounters
 *  GET  /billing/queries/aging-report            Unbilled AR aging buckets
 *  GET  /billing/queries/summary                 Billing summary report
 *  /billing/insurance-verification               Insurance eligibility checks
 *  /billing/codes                                CPT + SNOMED code assignment
 *  /billing/credit-notes                         Credit note workflow
 */
const router = Router();
router.use(authenticate);

// ── Claims ────────────────────────────────────────────────────────────────────
router.post('/encounters/:id/generate-claim', generateClaim);
router.get('/claims', listClaims);
router.get('/claims/counts', getClaimCounts);
router.post('/claims/submit', submitClaims);
router.get('/claims/:claimId', getClaim);
router.patch('/claims/:claimId/deny', denyClaim);
router.patch('/claims/:claimId/resubmit', resubmitClaim);
router.patch('/claims/:claimId/write-off', writeOffClaim);
router.post('/claims/:claimId/attachments', addClaimAttachment);

// ── Billing queries & reports ─────────────────────────────────────────────────
router.get('/queries/unbilled-encounters', getUnbilledEncounters);
router.get('/queries/denied-encounters', getDeniedEncounters);
router.get('/queries/aging-report', getAgingReport);
router.get('/queries/summary', getBillingSummary);

// ── Sub-modules ───────────────────────────────────────────────────────────────
router.use('/insurance-verification', insuranceVerificationRoutes);
router.use('/codes', billingCodeRoutes);
router.use('/credit-notes', creditNoteRoutes);

export const billingRoutes = router;
