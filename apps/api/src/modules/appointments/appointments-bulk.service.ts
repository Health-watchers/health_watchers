import { Types } from 'mongoose';
import { AppointmentModel } from './appointment.model';
import { NotificationModel } from '../notifications/notification.model';
import { WaitlistModel } from './waitlist.model';
import crypto from 'crypto';

export interface BulkAppointmentAction {
  appointmentId: string;
  action: 'reschedule' | 'cancel';
  rescheduleData?: {
    newDoctorId?: string;
    newScheduledAt?: Date;
  };
  cancelReason?: string;
}

export interface BulkAppointmentResult {
  appointmentId: string;
  action: string;
  success: boolean;
  error?: string;
  appointment?: any;
}

export class AppointmentsBulkService {
  async dryRun(actions: BulkAppointmentAction[]): Promise<any[]> {
    const conflicts: any[] = [];

    for (const action of actions) {
      const appointment = await AppointmentModel.findById(action.appointmentId).lean();
      if (!appointment) {
        conflicts.push({
          appointmentId: action.appointmentId,
          conflict: 'Appointment not found',
        });
        continue;
      }

      if (action.action === 'reschedule' && action.rescheduleData?.newScheduledAt) {
        const conflict = await this.checkConflict(
          action.rescheduleData.newDoctorId || String(appointment.doctorId),
          action.rescheduleData.newScheduledAt,
          appointment.duration,
          appointment._id.toString()
        );

        if (conflict) {
          conflicts.push({
            appointmentId: action.appointmentId,
            conflict: 'Doctor has conflicting appointment',
            newTime: action.rescheduleData.newScheduledAt,
          });
        }
      }
    }

    return conflicts;
  }

  async executeBulk(
    actions: BulkAppointmentAction[],
    userId: string,
    clinicId: string
  ): Promise<BulkAppointmentResult[]> {
    const results: BulkAppointmentResult[] = [];

    for (const action of actions) {
      try {
        const result = await this.executeAction(action, userId, clinicId);
        results.push(result);
      } catch (error) {
        results.push({
          appointmentId: action.appointmentId,
          action: action.action,
          success: false,
          error: String(error),
        });
      }
    }

    return results;
  }

  private async executeAction(
    action: BulkAppointmentAction,
    userId: string,
    clinicId: string
  ): Promise<BulkAppointmentResult> {
    const appointment = await AppointmentModel.findById(action.appointmentId);
    if (!appointment) {
      throw new Error('Appointment not found');
    }

    if (action.action === 'reschedule') {
      return this.rescheduleAppointment(appointment, action, userId, clinicId);
    } else if (action.action === 'cancel') {
      return this.cancelAppointment(appointment, action, userId, clinicId);
    }

    throw new Error('Invalid action');
  }

  private async rescheduleAppointment(
    appointment: any,
    action: BulkAppointmentAction,
    userId: string,
    clinicId: string
  ): Promise<BulkAppointmentResult> {
    const newDoctorId = action.rescheduleData?.newDoctorId || String(appointment.doctorId);
    const newScheduledAt = action.rescheduleData?.newScheduledAt || appointment.scheduledAt;

    // Check for conflicts
    const conflict = await this.checkConflict(
      newDoctorId,
      newScheduledAt,
      appointment.duration,
      appointment._id.toString()
    );

    if (conflict) {
      throw new Error('Doctor has conflicting appointment');
    }

    const updated = await AppointmentModel.findByIdAndUpdate(
      appointment._id,
      {
        doctorId: new Types.ObjectId(newDoctorId),
        scheduledAt: newScheduledAt,
      },
      { new: true }
    ).lean();

    // Notify patient
    await NotificationModel.create({
      userId: appointment.patientId,
      title: 'Appointment Rescheduled',
      message: `Your appointment has been rescheduled to ${newScheduledAt.toDateString()}`,
      type: 'appointment_reschedule',
      clinicId: new Types.ObjectId(clinicId),
      metadata: { appointmentId: appointment._id },
    });

    return {
      appointmentId: appointment._id.toString(),
      action: 'reschedule',
      success: true,
      appointment: updated,
    };
  }

  private async cancelAppointment(
    appointment: any,
    action: BulkAppointmentAction,
    userId: string,
    clinicId: string
  ): Promise<BulkAppointmentResult> {
    const updated = await AppointmentModel.findByIdAndUpdate(
      appointment._id,
      {
        status: 'cancelled',
        cancelledBy: new Types.ObjectId(userId),
        cancelledAt: new Date(),
        cancellationReason: action.cancelReason,
      },
      { new: true }
    ).lean();

    // Notify patient
    await NotificationModel.create({
      userId: appointment.patientId,
      title: 'Appointment Cancelled',
      message: `Your appointment has been cancelled. ${action.cancelReason || ''}`,
      type: 'appointment_cancelled',
      clinicId: new Types.ObjectId(clinicId),
      metadata: { appointmentId: appointment._id },
    });

    // Offer freed slot to waitlist
    await this.offerToWaitlist(appointment, clinicId);

    return {
      appointmentId: appointment._id.toString(),
      action: 'cancel',
      success: true,
      appointment: updated,
    };
  }

  private async checkConflict(
    doctorId: string,
    scheduledAt: Date,
    duration: number,
    excludeId: string
  ): Promise<boolean> {
    const proposedEnd = new Date(scheduledAt.getTime() + duration * 60_000);

    const candidates = await AppointmentModel.find({
      doctorId: new Types.ObjectId(doctorId),
      status: { $in: ['scheduled', 'confirmed'] },
      _id: { $ne: new Types.ObjectId(excludeId) },
      scheduledAt: { $lt: proposedEnd },
    })
      .select('scheduledAt duration')
      .lean();

    return candidates.some((appt) => {
      const apptEnd = new Date(new Date(appt.scheduledAt).getTime() + appt.duration * 60_000);
      return apptEnd > scheduledAt;
    });
  }

  private async offerToWaitlist(appointment: any, clinicId: string): Promise<void> {
    const waitlistEntry = await WaitlistModel.findOne({
      clinicId: new Types.ObjectId(clinicId),
      doctorId: appointment.doctorId,
      status: 'waiting',
    })
      .sort({ addedAt: 1 })
      .lean();

    if (waitlistEntry) {
      await NotificationModel.create({
        userId: waitlistEntry.patientId,
        title: 'Appointment Slot Available',
        message: `A slot just became available with ${appointment.doctorId}. Would you like to book it?`,
        type: 'waitlist_offer',
        clinicId: new Types.ObjectId(clinicId),
        metadata: {
          originalAppointmentId: appointment._id,
          scheduledAt: appointment.scheduledAt,
        },
      });
    }
  }
}

export const appointmentsBulkService = new AppointmentsBulkService();
