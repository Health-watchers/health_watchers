package com.healthwatchers.sdk;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.healthwatchers.sdk.model.AuthTokens;
import java.io.IOException;
import java.lang.reflect.Type;
import java.time.Duration;
import java.util.List;
import okhttp3.HttpUrl;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * Client for the Health Watchers REST API (see {@code apps/api/src/docs/swagger.ts}).
 *
 * <p>Two authentication modes are supported, matching the API's two security schemes
 * ({@code bearerAuth} / {@code apiKeyAuth}):
 *
 * <ul>
 *   <li><b>JWT mode</b> — construct with {@link #HealthWatchersClient(String)} and then call
 *       {@link #login(String, String)} to obtain and store an access token; subsequent
 *       requests send {@code Authorization: Bearer <token>}.</li>
 *   <li><b>API key mode</b> — construct with {@link #withApiKey(String, String)}; every
 *       request sends {@code X-API-Key: <key>}. No login step is needed or possible in this
 *       mode.</li>
 * </ul>
 *
 * <p>Example (JWT mode):
 *
 * <pre>{@code
 * HealthWatchersClient client = new HealthWatchersClient("https://api.healthwatchers.com/api/v1");
 * client.login("doctor@example-clinic.com", "correct-horse-battery-staple");
 * Patient patient = client.patients().create(new CreatePatientRequest(...));
 * }</pre>
 */
public class HealthWatchersClient {

  private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");

  private final String baseUrl;
  private final OkHttpClient httpClient;
  final Gson gson;

  private final AuthMode authMode;
  private String accessToken;
  private final String apiKey;

  private final PatientsClient patients;
  private final AppointmentsClient appointments;
  private final PaymentsClient payments;

  private enum AuthMode {
    JWT,
    API_KEY
  }

  /**
   * Creates a client in JWT mode. Call {@link #login(String, String)} before making any
   * authenticated request.
   *
   * @param baseUrl the API base URL including its version prefix, e.g.
   *     {@code "https://api.healthwatchers.com/api/v1"} (see the {@code servers} list in
   *     {@code apps/api/src/docs/swagger.ts})
   */
  public HealthWatchersClient(String baseUrl) {
    this(baseUrl, AuthMode.JWT, null, defaultHttpClient());
  }

  private HealthWatchersClient(String baseUrl, AuthMode authMode, String apiKey, OkHttpClient httpClient) {
    if (baseUrl == null || baseUrl.isEmpty()) {
      throw new IllegalArgumentException("baseUrl must not be null or empty");
    }
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    this.authMode = authMode;
    this.apiKey = apiKey;
    this.httpClient = httpClient;
    this.gson = new GsonBuilder().create();
    this.patients = new PatientsClient(this);
    this.appointments = new AppointmentsClient(this);
    this.payments = new PaymentsClient(this);
  }

  /**
   * Creates a client in API-key mode. Every request sends {@code X-API-Key: apiKey}; there is
   * no login step (see {@code apps/api/src/modules/api-keys/api-keys.controller.ts} for how to
   * mint a key via {@code POST /api-keys} using an already-authenticated JWT session).
   *
   * @param baseUrl the API base URL including its version prefix, e.g.
   *     {@code "https://api.healthwatchers.com/api/v1"}
   * @param apiKey a raw API key, e.g. {@code "hw_...."}
   */
  public static HealthWatchersClient withApiKey(String baseUrl, String apiKey) {
    if (apiKey == null || apiKey.isEmpty()) {
      throw new IllegalArgumentException("apiKey must not be null or empty");
    }
    return new HealthWatchersClient(baseUrl, AuthMode.API_KEY, apiKey, defaultHttpClient());
  }

  private static OkHttpClient defaultHttpClient() {
    return new OkHttpClient.Builder()
        .connectTimeout(Duration.ofSeconds(10))
        .readTimeout(Duration.ofSeconds(30))
        .writeTimeout(Duration.ofSeconds(30))
        .build();
  }

  /**
   * Authenticates against {@code POST /auth/login} and, on success, stores the returned access
   * token for use by subsequent requests made through this client.
   *
   * @return the tokens issued by the API
   * @throws MfaRequiredException if the account has MFA enabled ({@code status: "mfa_required"}
   *     in the response) — carries the {@code tempToken} needed to complete MFA verification
   * @throws HealthWatchersApiException if the API rejects the request (e.g. invalid
   *     credentials, locked account)
   * @throws IOException on a network-level failure
   * @throws IllegalStateException if this client was created via {@link #withApiKey}
   */
  public AuthTokens login(String email, String password)
      throws IOException, HealthWatchersApiException {
    if (authMode == AuthMode.API_KEY) {
      throw new IllegalStateException(
          "login() is not applicable to a client created with withApiKey(...); "
              + "API-key clients authenticate every request via the X-API-Key header.");
    }

    JsonObject body = new JsonObject();
    body.addProperty("email", email);
    body.addProperty("password", password);

    Request request =
        newRequestBuilder("/auth/login")
            .post(RequestBody.create(gson.toJson(body), JSON))
            .build();

    try (Response response = httpClient.newCall(request).execute()) {
      JsonObject json = parseJsonObject(response);

      if (!response.isSuccessful()) {
        throw HealthWatchersApiException.fromErrorBody(response.code(), json);
      }

      String status = json.has("status") && !json.get("status").isJsonNull()
          ? json.get("status").getAsString()
          : null;

      if ("mfa_required".equals(status)) {
        JsonObject data = json.getAsJsonObject("data");
        String tempToken =
            data != null && data.has("tempToken") && !data.get("tempToken").isJsonNull()
                ? data.get("tempToken").getAsString()
                : null;
        throw new MfaRequiredException(tempToken);
      }

      AuthTokens tokens = gson.fromJson(json.get("data"), AuthTokens.class);
      this.accessToken = tokens.accessToken;
      return tokens;
    }
  }

  /** Explicitly set/replace the access token, e.g. after refreshing it out of band. */
  public void setAccessToken(String accessToken) {
    this.accessToken = accessToken;
  }

  public PatientsClient patients() {
    return patients;
  }

  public AppointmentsClient appointments() {
    return appointments;
  }

  public PaymentsClient payments() {
    return payments;
  }

  // ── Internal request/response plumbing shared by the resource clients ──────────────────

  HttpUrl.Builder newUrlBuilder(String path) {
    String normalizedPath = path.startsWith("/") ? path : "/" + path;
    HttpUrl url = HttpUrl.parse(baseUrl + normalizedPath);
    if (url == null) {
      throw new IllegalArgumentException("Invalid URL: " + baseUrl + normalizedPath);
    }
    return url.newBuilder();
  }

  Request.Builder newRequestBuilder(String path) {
    return newRequestBuilder(newUrlBuilder(path).build());
  }

  Request.Builder newRequestBuilder(HttpUrl url) {
    Request.Builder builder = new Request.Builder().url(url);
    if (authMode == AuthMode.API_KEY) {
      builder.header("X-API-Key", apiKey);
    } else if (accessToken != null) {
      builder.header("Authorization", "Bearer " + accessToken);
    }
    return builder;
  }

  RequestBody jsonBody(Object payload) {
    return RequestBody.create(gson.toJson(payload), JSON);
  }

  /** Executes a request whose response envelope is {@code { status, data: <T> }}. */
  <T> T execute(Request request, Type dataType) throws IOException, HealthWatchersApiException {
    try (Response response = httpClient.newCall(request).execute()) {
      JsonObject json = parseJsonObject(response);
      if (!response.isSuccessful()) {
        throw HealthWatchersApiException.fromErrorBody(response.code(), json);
      }
      return gson.fromJson(json.get("data"), dataType);
    }
  }

  /**
   * Executes a request whose response envelope is
   * {@code { status, data: [<T>, ...], pagination: {...} } }.
   */
  <T> com.healthwatchers.sdk.model.PagedResult<T> executePaged(Request request, Type listType)
      throws IOException, HealthWatchersApiException {
    try (Response response = httpClient.newCall(request).execute()) {
      JsonObject json = parseJsonObject(response);
      if (!response.isSuccessful()) {
        throw HealthWatchersApiException.fromErrorBody(response.code(), json);
      }
      List<T> data = gson.fromJson(json.get("data"), listType);
      com.healthwatchers.sdk.model.PaginationMeta pagination =
          json.has("pagination")
              ? gson.fromJson(
                  json.get("pagination"), com.healthwatchers.sdk.model.PaginationMeta.class)
              : null;
      return new com.healthwatchers.sdk.model.PagedResult<>(data, pagination);
    }
  }

  private JsonObject parseJsonObject(Response response) throws IOException {
    String bodyString = response.body() != null ? response.body().string() : "";
    if (bodyString.isEmpty()) {
      return new JsonObject();
    }
    JsonElement parsed = JsonParser.parseString(bodyString);
    return parsed.isJsonObject() ? parsed.getAsJsonObject() : new JsonObject();
  }
}
