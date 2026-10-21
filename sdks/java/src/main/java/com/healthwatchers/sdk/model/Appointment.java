package com.healthwatchers.sdk.model;

/**
 * Mirrors {@code AppointmentResponse} produced by
 * {@code apps/api/src/modules/appointments/appointments.transformer.ts#toAppointmentResponse}.
 *
 * <p>{@code internalNotes} may be stripped from the response for non-staff roles
 * (see {@code stripRestrictedFields} in the API), in which case it is simply absent/null.
 */
public class Appointment {
  public String id;
  public String patientId;
  public String doctorId;
  public String clinicId;

  /** ISO-8601 timestamp. */
  public String scheduledAt;

  /** Duration in minutes. */
  public Integer duration;

  public String type;
  public String status;
  public String reason;
  public String notes;
  public String internalNotes;
  public String videoCallUrl;

  /** ISO-8601 timestamp; present once the patient has checked in. */
  public String checkedInAt;

  /** ISO-8601 timestamp. */
  public String createdAt;

  /** ISO-8601 timestamp. */
  public String updatedAt;

  @Override
  public String toString() {
    return "Appointment{id=" + id + ", patientId=" + patientId + ", doctorId=" + doctorId
        + ", scheduledAt=" + scheduledAt + ", status=" + status + "}";
  }
}
