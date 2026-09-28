import { Types } from 'mongoose';
import { AppointmentModel } from './appointment.model';
import crypto from 'crypto';

const TOKEN_EXPIRY_MINUTES = 24 * 60; // 24 hours
const DEFAULT_CHECKIN_WINDOW_BEFORE_MINUTES = 30;
const DEFAULT_CHECKIN_WINDOW_AFTER_MINUTES = 15;

export interface CheckinToken {
  token: string;
  appointmentId: string;
  expiresAt: Date;
}

export class QRCheckinService {
  private secret = process.env.QR_CHECKIN_SECRET || 'default-secret-change-in-prod';

  generateCheckInToken(appointmentId: string): CheckinToken {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + TOKEN_EXPIRY_MINUTES);

    const payload = `${appointmentId}:${expiresAt.getTime()}`;
    const hash = crypto
      .hmac('sha256', this.secret)
      .update(payload)
      .digest('hex');

    const token = `${Buffer.from(payload).toString('base64')}.${hash}`;

    return { token, appointmentId, expiresAt };
  }

  async validateAndCheckIn(
    token: string,
    clinicId: string,
    configWindow?: { beforeMinutes?: number; afterMinutes?: number }
  ): Promise<{ success: boolean; appointmentId?: string; error?: string }> {
    try {
      const [payload, hash] = token.split('.');

      if (!payload || !hash) {
        return { success: false, error: 'Invalid token format' };
      }

      // Verify signature
      const expectedHash = crypto
        .hmac('sha256', this.secret)
        .update(payload)
        .digest('hex');

      if (hash !== expectedHash) {
        return { success: false, error: 'Invalid token signature' };
      }

      const decodedPayload = Buffer.from(payload, 'base64').toString();
      const [appointmentId, expiryTimestamp] = decodedPayload.split(':');

      // Check expiry
      if (new Date().getTime() > parseInt(expiryTimestamp)) {
        return { success: false, error: 'Token expired' };
      }

      const appointment = await AppointmentModel.findOne({
        _id: appointmentId,
        clinicId: new Types.ObjectId(clinicId),
      });

      if (!appointment) {
        return { success: false, error: 'Appointment not found' };
      }

      // Check appointment hasn't already been checked in
      if (appointment.status === 'patient_arrived') {
        return { success: false, error: 'Already checked in' };
      }

      // Validate check-in window
      const beforeMinutes = configWindow?.beforeMinutes || DEFAULT_CHECKIN_WINDOW_BEFORE_MINUTES;
      const afterMinutes = configWindow?.afterMinutes || DEFAULT_CHECKIN_WINDOW_AFTER_MINUTES;

      const windowStart = new Date(appointment.scheduledAt.getTime() - beforeMinutes * 60_000);
      const windowEnd = new Date(appointment.scheduledAt.getTime() + afterMinutes * 60_000);
      const now = new Date();

      if (now < windowStart || now > windowEnd) {
        return {
          success: false,
          error: `Check-in window is ${beforeMinutes}min before to ${afterMinutes}min after appointment time`,
        };
      }

      // Perform check-in
      const updated = await AppointmentModel.findByIdAndUpdate(
        appointmentId,
        {
          status: 'patient_arrived',
          checkedInAt: new Date(),
        },
        { new: true }
      ).lean();

      return { success: true, appointmentId };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async generateQRCode(appointmentId: string): Promise<string> {
    const token = this.generateCheckInToken(appointmentId);
    const qrCodeURL = `${process.env.API_URL || 'http://localhost:3000'}/appointments/check-in/${token.token}`;
    return qrCodeURL;
  }
}

export const qrCheckinService = new QRCheckinService();
