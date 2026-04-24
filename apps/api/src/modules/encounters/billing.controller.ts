import { Request, Response } from 'express';
import { EncounterModel } from './encounter.model';
import { PatientModel } from '../patients/patient.model';
import { UserModel } from '../auth/models/user.model';

export async function getBillingSummary(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { clinicId } = req.user!;

  const encounter = await EncounterModel.findOne({ _id: id, clinicId })
    .populate('patientId', 'fullName dateOfBirth gender insurance')
    .populate('attendingDoctorId', 'fullName npiNumber')
    .lean();

  if (!encounter) {
    res.status(404).json({
      success: false,
      error: 'Encounter not found',
    });
    return;
  }

  const billingSummary = {
    patient: {
      fullName: (encounter.patientId as any).fullName,
      dateOfBirth: (encounter.patientId as any).dateOfBirth,
      gender: (encounter.patientId as any).gender,
      insurance: (encounter.patientId as any).insurance,
    },
    encounter: {
      date: encounter.createdAt,
      chiefComplaint: encounter.chiefComplaint,
      status: encounter.status,
    },
    provider: {
      fullName: (encounter.attendingDoctorId as any).fullName,
      npiNumber: (encounter.attendingDoctorId as any).npiNumber,
    },
    diagnosis: encounter.diagnosis || [],
    billing: encounter.billing || {
      cptCodes: [],
      billingStatus: 'unbilled',
      totalFee: '0.00',
    },
  };

  res.json({
    success: true,
    data: billingSummary,
  });
}

export async function generateClaim(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { clinicId } = req.user!;

  const encounter = await EncounterModel.findOne({ _id: id, clinicId })
    .populate('patientId')
    .populate('attendingDoctorId')
    .lean();

  if (!encounter) {
    res.status(404).json({
      success: false,
      error: 'Encounter not found',
    });
    return;
  }

  if (!encounter.billing || encounter.billing.cptCodes.length === 0) {
    res.status(400).json({
      success: false,
      error: 'No billing codes assigned to this encounter',
    });
    return;
  }

  if (!encounter.diagnosis || encounter.diagnosis.length === 0) {
    res.status(400).json({
      success: false,
      error: 'No diagnosis codes assigned to this encounter',
    });
    return;
  }

  // CMS-1500 compatible claim summary
  const claim = {
    claimType: 'CMS-1500',
    patient: {
      fullName: (encounter.patientId as any).fullName,
      dateOfBirth: (encounter.patientId as any).dateOfBirth,
      gender: (encounter.patientId as any).gender,
      address: (encounter.patientId as any).address,
      insurance: (encounter.patientId as any).insurance,
    },
    provider: {
      fullName: (encounter.attendingDoctorId as any).fullName,
      npiNumber: (encounter.attendingDoctorId as any).npiNumber,
    },
    serviceDate: encounter.createdAt,
    diagnosisCodes: encounter.diagnosis.map(d => ({
      code: d.code,
      description: d.description,
      isPrimary: d.isPrimary,
    })),
    procedureCodes: encounter.billing.cptCodes.map(cpt => ({
      code: cpt.code,
      description: cpt.description,
      units: cpt.units,
      fee: cpt.fee,
    })),
    totalCharges: encounter.billing.totalFee,
    billingStatus: encounter.billing.billingStatus,
  };

  res.json({
    success: true,
    data: claim,
  });
}

export async function updateBilling(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { clinicId } = req.user!;
  const { cptCodes, billingStatus, insuranceClaimId } = req.body;

  const encounter = await EncounterModel.findOne({ _id: id, clinicId });

  if (!encounter) {
    res.status(404).json({
      success: false,
      error: 'Encounter not found',
    });
    return;
  }

  // Calculate total fee
  let totalFee = 0;
  if (cptCodes && Array.isArray(cptCodes)) {
    for (const cpt of cptCodes) {
      const fee = parseFloat(cpt.fee) * cpt.units;
      totalFee += fee;
    }
  }

  const billingUpdate: any = {
    cptCodes: cptCodes || encounter.billing?.cptCodes || [],
    billingStatus: billingStatus || encounter.billing?.billingStatus || 'unbilled',
    totalFee: totalFee.toFixed(2),
  };

  if (insuranceClaimId) {
    billingUpdate.insuranceClaimId = insuranceClaimId;
  }

  if (billingStatus === 'billed' && !encounter.billing?.billedAt) {
    billingUpdate.billedAt = new Date();
  }

  if (billingStatus === 'paid' && !encounter.billing?.paidAt) {
    billingUpdate.paidAt = new Date();
  }

  encounter.billing = billingUpdate;
  await encounter.save();

  res.json({
    success: true,
    data: encounter.billing,
  });
}
