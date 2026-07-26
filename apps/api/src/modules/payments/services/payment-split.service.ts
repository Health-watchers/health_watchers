import { Types } from 'mongoose';
import { ClinicModel } from '../../clinics/clinic.model';
import { UserModel } from '../../auth/models/user.model';

export interface SplitPaymentOperation {
  destination: string;
  amount: string;
  memo: string;
  recipientType: 'clinic' | 'doctor';
  recipientId: string;
}

export interface SplitPaymentResult {
  operations: SplitPaymentOperation[];
  clinicAmount: string;
  doctorAmount: string;
  totalAmount: string;
}

export class PaymentSplitService {
  async calculateSplitPayment(
    clinicId: string,
    totalAmount: string,
    doctorId?: string,
    memo?: string
  ): Promise<SplitPaymentResult> {
    const clinic = await ClinicModel.findById(clinicId);
    if (!clinic) {
      throw new Error('Clinic not found');
    }

    // Check if split is enabled
    if (!clinic.paymentSplitConfig?.splitEnabled) {
      // No split - entire amount goes to clinic
      return {
        operations: [
          {
            destination: clinic.stellarPublicKey!,
            amount: totalAmount,
            memo: memo || 'Payment',
            recipientType: 'clinic',
            recipientId: clinicId,
          },
        ],
        clinicAmount: totalAmount,
        doctorAmount: '0',
        totalAmount,
      };
    }

    // Get split ratio
    let splitRatio = clinic.paymentSplitConfig.defaultSplitRatio;

    if (doctorId) {
      const override = clinic.paymentSplitConfig.doctorOverrides?.find(
        (o) => o.doctorId.toString() === doctorId
      );
      if (override) {
        splitRatio = override.splitRatio;
      }
    }

    // Validate split ratio sums to 100
    if (splitRatio.clinic + splitRatio.doctor !== 100) {
      throw new Error('Split ratio must sum to 100%');
    }

    // Calculate amounts (using string arithmetic to avoid floating point errors)
    const total = parseFloat(totalAmount);
    const clinicAmount = ((total * splitRatio.clinic) / 100).toFixed(7);
    const doctorAmount = ((total * splitRatio.doctor) / 100).toFixed(7);

    const operations: SplitPaymentOperation[] = [];

    // Clinic payment
    operations.push({
      destination: clinic.stellarPublicKey!,
      amount: clinicAmount,
      memo: memo ? `${memo} (clinic)` : 'Clinic payment',
      recipientType: 'clinic',
      recipientId: clinicId,
    });

    // Doctor payment (if applicable)
    if (doctorId && splitRatio.doctor > 0) {
      const doctor = await UserModel.findById(doctorId);
      if (!doctor?.stellarPublicKey) {
        throw new Error('Doctor does not have a Stellar wallet configured');
      }

      operations.push({
        destination: doctor.stellarPublicKey,
        amount: doctorAmount,
        memo: memo ? `${memo} (doctor)` : 'Doctor payment',
        recipientType: 'doctor',
        recipientId: doctorId,
      });
    }

    return {
      operations,
      clinicAmount,
      doctorAmount,
      totalAmount,
    };
  }
}
