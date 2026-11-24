package com.healthwatchers.sdk.model;

/**
 * Optional query parameters for {@code GET /appointments}, matching
 * {@code listAppointmentsQuerySchema} filters read in the appointments controller:
 * {@code doctorId, patientId, status, dateFrom, dateTo, page, limit}. Any field left
 * {@code null} is simply omitted from the request's query string.
 */
public class AppointmentListParams {
  public String doctorId;
  public String patientId;

  /** e.g. "scheduled", "confirmed", "patient_arrived", "completed", "cancelled". */
  public String status;

  /** ISO-8601 date/timestamp lower bound (inclusive) on scheduledAt. */
  public String dateFrom;

  /** ISO-8601 date/timestamp upper bound (inclusive) on scheduledAt. */
  public String dateTo;

  public Integer page;
  public Integer limit;

  public AppointmentListParams doctorId(String doctorId) {
    this.doctorId = doctorId;
    return this;
  }

  public AppointmentListParams patientId(String patientId) {
    this.patientId = patientId;
    return this;
  }

  public AppointmentListParams status(String status) {
    this.status = status;
    return this;
  }

  public AppointmentListParams dateFrom(String dateFrom) {
    this.dateFrom = dateFrom;
    return this;
  }

  public AppointmentListParams dateTo(String dateTo) {
    this.dateTo = dateTo;
    return this;
  }

  public AppointmentListParams page(int page) {
    this.page = page;
    return this;
  }

  public AppointmentListParams limit(int limit) {
    this.limit = limit;
    return this;
  }
}
