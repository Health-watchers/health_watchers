package com.healthwatchers.sdk;

import com.google.gson.reflect.TypeToken;
import com.healthwatchers.sdk.model.Appointment;
import com.healthwatchers.sdk.model.AppointmentListParams;
import com.healthwatchers.sdk.model.CreateAppointmentRequest;
import com.healthwatchers.sdk.model.PagedResult;
import java.io.IOException;
import java.lang.reflect.Type;
import okhttp3.HttpUrl;
import okhttp3.Request;

/**
 * Wraps the {@code /appointments} endpoints. Obtain via
 * {@link HealthWatchersClient#appointments()}.
 */
public class AppointmentsClient {

  private static final Type APPOINTMENT_LIST_TYPE =
      new TypeToken<java.util.List<Appointment>>() {}.getType();

  private final HealthWatchersClient client;

  AppointmentsClient(HealthWatchersClient client) {
    this.client = client;
  }

  /**
   * {@code POST /appointments} — schedules a new appointment. Returns 409 (surfaced as a
   * {@link HealthWatchersApiException} with error code {@code "TimeSlotUnavailable"} or
   * {@code "DoctorUnavailable"}) if the doctor is already booked or unavailable at that time.
   */
  public Appointment create(CreateAppointmentRequest appointmentRequest)
      throws IOException, HealthWatchersApiException {
    Request request =
        client
            .newRequestBuilder("/appointments")
            .post(client.jsonBody(appointmentRequest))
            .build();
    return client.execute(request, Appointment.class);
  }

  /** {@code GET /appointments/:id}. */
  public Appointment get(String id) throws IOException, HealthWatchersApiException {
    Request request = client.newRequestBuilder("/appointments/" + id).get().build();
    return client.execute(request, Appointment.class);
  }

  /**
   * {@code GET /appointments} — paginated list, filtered by any non-null fields of
   * {@code params}. Pass {@code new AppointmentListParams()} (or {@code null}) for an
   * unfiltered first page.
   */
  public PagedResult<Appointment> list(AppointmentListParams params)
      throws IOException, HealthWatchersApiException {
    HttpUrl.Builder urlBuilder = client.newUrlBuilder("/appointments");
    if (params != null) {
      if (params.doctorId != null) urlBuilder.addQueryParameter("doctorId", params.doctorId);
      if (params.patientId != null) urlBuilder.addQueryParameter("patientId", params.patientId);
      if (params.status != null) urlBuilder.addQueryParameter("status", params.status);
      if (params.dateFrom != null) urlBuilder.addQueryParameter("dateFrom", params.dateFrom);
      if (params.dateTo != null) urlBuilder.addQueryParameter("dateTo", params.dateTo);
      if (params.page != null) urlBuilder.addQueryParameter("page", String.valueOf(params.page));
      if (params.limit != null) urlBuilder.addQueryParameter("limit", String.valueOf(params.limit));
    }

    Request request = client.newRequestBuilder(urlBuilder.build()).get().build();
    return client.executePaged(request, APPOINTMENT_LIST_TYPE);
  }
}
