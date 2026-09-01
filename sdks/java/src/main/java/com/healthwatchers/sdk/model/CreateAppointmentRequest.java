package com.healthwatchers.sdk.model;

/**
 * Request body for {@code POST /appointments}, matching the destructured fields read
 * from {@code req.body} in {@code apps/api/src/modules/appointments/appointments.controller.ts}
 * (create handler): {@code patientId, doctorId, scheduledAt, duration, type, chiefComplaint, notes}.
 */
public class CreateAppointmentRequest {
  public String patientId;
  public String doctorId;

  /** ISO-8601 timestamp, e.g. "2026-09-15T14:30:00Z". */
  public String scheduledAt;

  /** Duration in minutes. Defaults to 30 server-side if omitted (leave null to use the default). */
  public Integer duration;

  public String type;
  public String chiefComplaint;
  public String notes;

  public CreateAppointmentRequest() {}

  public CreateAppointmentRequest(
      String patientId, String doctorId, String scheduledAt, String type) {
    this.patientId = patientId;
    this.doctorId = doctorId;
    this.scheduledAt = scheduledAt;
    this.type = type;
  }

  public CreateAppointmentRequest duration(int duration) {
    this.duration = duration;
    return this;
  }

  public CreateAppointmentRequest chiefComplaint(String chiefComplaint) {
    this.chiefComplaint = chiefComplaint;
    return this;
  }

  public CreateAppointmentRequest notes(String notes) {
    this.notes = notes;
    return this;
  }
}
