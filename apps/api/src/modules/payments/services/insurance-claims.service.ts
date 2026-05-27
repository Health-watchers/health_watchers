import { InsuranceClaimModel, calculateClaimHash } from '../models/insurance-claim.model';
import logger from '@api/utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface SubmitClaimInput {
  clinicId: string;
  patientId: string;
  encounterId?: string;
  procedureCodes: string[];
  diagnosisCodes: string[];
  claimAmount: string;
  currency?: string;
  serviceDate: Date;
  insuranceCompany?: string;
}

export interface ClaimVerificationInput {
  claimId: string;
  claimData: {
    patientId: string;
    clinicId: string;
    procedureCodes: string[];
    diagnosisCodes: string[];
    claimAmount: string;
    currency: string;
    serviceDate: Date;
    submissionDate: Date;
  };
}

/**
 * Submit an insurance claim to the blockchain
 */
export async function submitInsuranceClaim(input: SubmitClaimInput) {
  const claimId = `CLAIM-${uuidv4().substring(0, 8).toUpperCase()}`;
  const submissionDate = new Date();

  const claimData = {
    claimId,
    patientId: input.patientId,
    clinicId: input.clinicId,
    procedureCodes: input.procedureCodes,
    diagnosisCodes: input.diagnosisCodes,
    claimAmount: input.claimAmount,
    currency: input.currency || 'USD',
    serviceDate: input.serviceDate,
    submissionDate,
  };

  const claimHash = calculateClaimHash(claimData);

  const claim = await InsuranceClaimModel.create({
    claimId,
    clinicId: input.clinicId,
    patientId: input.patientId,
    encounterId: input.encounterId,
    procedureCodes: input.procedureCodes,
    diagnosisCodes: input.diagnosisCodes,
    claimAmount: input.claimAmount,
    currency: input.currency || 'USD',
    serviceDate: input.serviceDate,
    submissionDate,
    claimHash,
    insuranceCompany: input.insuranceCompany,
    status: 'submitted',
    statusUpdates: [
      {
        status: 'submitted',
        timestamp: submissionDate,
        notes: 'Claim submitted to blockchain',
      },
    ],
  });

  logger.info(
    {
      claimId,
      clinicId: input.clinicId,
      claimAmount: input.claimAmount,
      claimHash,
    },
    'Insurance claim submitted'
  );

  return {
    claimId,
    claimHash,
    submissionDate,
    status: 'submitted',
  };
}

/**
 * Verify a claim against on-chain data
 */
export async function verifyInsuranceClaim(input: ClaimVerificationInput) {
  const claim = await InsuranceClaimModel.findOne({ claimId: input.claimId });

  if (!claim) {
    throw new Error(`Claim not found: ${input.claimId}`);
  }

  const calculatedHash = calculateClaimHash(input.claimData);
  const hashMatch = calculatedHash === claim.claimHash;

  if (!hashMatch) {
    logger.warn(
      {
        claimId: input.claimId,
        expectedHash: claim.claimHash,
        calculatedHash,
      },
      'Claim hash mismatch during verification'
    );
  }

  // Update verification data
  await InsuranceClaimModel.updateOne(
    { claimId: input.claimId },
    {
      $set: {
        'verificationData.verifiedAt': new Date(),
        'verificationData.hashMatch': hashMatch,
      },
    }
  );

  return {
    claimId: input.claimId,
    verified: hashMatch,
    claimHash: claim.claimHash,
    calculatedHash,
  };
}

/**
 * Update claim status (typically from insurance company)
 */
export async function updateClaimStatus(
  claimId: string,
  newStatus: 'under_review' | 'approved' | 'denied' | 'paid',
  notes?: string
) {
  const claim = await InsuranceClaimModel.findOne({ claimId });

  if (!claim) {
    throw new Error(`Claim not found: ${claimId}`);
  }

  const statusUpdate = {
    status: newStatus,
    timestamp: new Date(),
    notes,
  };

  await InsuranceClaimModel.updateOne(
    { claimId },
    {
      $set: { status: newStatus },
      $push: { statusUpdates: statusUpdate },
    }
  );

  logger.info(
    {
      claimId,
      newStatus,
      notes,
    },
    'Claim status updated'
  );

  return { claimId, status: newStatus, updatedAt: statusUpdate.timestamp };
}

/**
 * Get claim history with blockchain proof
 */
export async function getClaimHistory(clinicId: string, limit = 50) {
  const claims = await InsuranceClaimModel.find({ clinicId })
    .sort({ submissionDate: -1 })
    .limit(limit)
    .lean();

  return claims.map((claim) => ({
    claimId: claim.claimId,
    status: claim.status,
    claimAmount: claim.claimAmount,
    currency: claim.currency,
    serviceDate: claim.serviceDate,
    submissionDate: claim.submissionDate,
    claimHash: claim.claimHash,
    stellarTxHash: claim.stellarTxHash,
    insuranceCompany: claim.insuranceCompany,
    statusUpdates: claim.statusUpdates,
    verified: claim.verificationData?.hashMatch || false,
  }));
}
