package com.healthwatchers.sdk;

import com.google.gson.reflect.TypeToken;
import com.healthwatchers.sdk.model.CreatePatientRequest;
import com.healthwatchers.sdk.model.PagedResult;
import com.healthwatchers.sdk.model.Patient;
import java.io.IOException;
import java.lang.reflect.Type;
import okhttp3.HttpUrl;
import okhttp3.Request;

/**
 * Wraps the {@code /patients} endpoints. Obtain via {@link HealthWatchersClient#patients()}.
 */
public class PatientsClient {

  private static final Type PATIENT_LIST_TYPE = new TypeToken<java.util.List<Patient>>() {}.getType();

  private final HealthWatchersClient client;

  PatientsClient(HealthWatchersClient client) {
    this.client = client;
  }

  /** {@code POST /patients} — creates a patient scoped to the caller's own clinic. */
  public Patient create(CreatePatientRequest patientRequest)
      throws IOException, HealthWatchersApiException {
    Request request =
        client
            .newRequestBuilder("/patients")
            .post(client.jsonBody(patientRequest))
            .build();
    return client.execute(request, Patient.class);
  }

  /** {@code GET /patients/:id}. */
  public Patient get(String id) throws IOException, HealthWatchersApiException {
    Request request = client.newRequestBuilder("/patients/" + id).get().build();
    return client.execute(request, Patient.class);
  }

  /**
   * {@code GET /patients} — paginated list, scoped to the caller's own clinic (unless the
   * caller is a SUPER_ADMIN and passes {@code clinicId} explicitly).
   *
   * @param page 1-based page number; pass null to use the server default (1)
   * @param limit page size, max 100; pass null to use the server default (20)
   * @param clinicId optional; only honored for SUPER_ADMIN callers
   */
  public PagedResult<Patient> list(Integer page, Integer limit, String clinicId)
      throws IOException, HealthWatchersApiException {
    HttpUrl.Builder urlBuilder = client.newUrlBuilder("/patients");
    if (page != null) urlBuilder.addQueryParameter("page", String.valueOf(page));
    if (limit != null) urlBuilder.addQueryParameter("limit", String.valueOf(limit));
    if (clinicId != null) urlBuilder.addQueryParameter("clinicId", clinicId);

    Request request = client.newRequestBuilder(urlBuilder.build()).get().build();
    return client.executePaged(request, PATIENT_LIST_TYPE);
  }
}
