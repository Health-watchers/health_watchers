import { Request, Response } from 'express';
import { InsuranceClaimModel } from './claim.model';
import { buildCms1500, buildEdi837 } from './claim-builder';

/**
 * POST /api/v1/encounters/:id/billing/generate-claim
 */
export async function generateClaim(req: Request, res: Response) {
  try {
    const { id: encounterId } = req.params;
    const { patientId, clinicId, clinicNpi, patientDob, patientName,
            serviceDate, cptCodes, diagnosisCodes, amounts } = req.body;

    const cms1500Data = buildCms1500({
      encounterId, patientId, clinicId, clinicNpi,
      patientDob, patientName, serviceDate, cptCodes, diagnosisCodes, amounts,
    });
    const edi837Data = buildEdi837({
      encounterId, patientId, clinicId, clinicNpi,
      patientDob, patientName, serviceDate, cptCodes, diagnosisCodes, amounts,
    });
    const totalAmount = (amounts as number[]).reduce((s, a) => s + a, 0);

    const claim = await InsuranceClaimModel.create({
      encounterId, patientId, clinicId, cptCodes, diagnosisCodes,
      totalAmount, cms1500Data, edi837Data, status: 'draft',
    });

    return res.status(201).json({ success: true, data: claim });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/v1/billing/claims
 */
export async function listClaims(req: Request, res: Response) {
  const { clinicId, status } = req.query;
  const filter: any = {};
  if (clinicId) filter.clinicId = clinicId;
  if (status)   filter.status = status;
  const claims = await InsuranceClaimModel.find(filter).sort({ createdAt: -1 }).limit(100);
  return res.json({ success: true, data: claims });
}

/**
 * PATCH /api/v1/billing/claims/:claimId/resubmit
 */
export async function resubmitClaim(req: Request, res: Response) {
  const { claimId } = req.params;
  const claim = await InsuranceClaimModel.findByIdAndUpdate(
    claimId,
    { status: 'resubmitted', rejectionReason: undefined, $inc: { resubmissionCount: 1 } },
    { new: true },
  );
  if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });
  return res.json({ success: true, data: claim });
}
