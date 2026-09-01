package com.healthwatchers.sdk;

import com.google.gson.JsonObject;

/**
 * Thrown when the Health Watchers API returns a non-2xx response, or a 2xx response whose
 * body carries an {@code error} field (the API's standard error envelope is
 * {@code { error: "SomeErrorCode", message: "human readable message" }}).
 */
public class HealthWatchersApiException extends Exception {

  private final int httpStatusCode;
  private final String errorCode;

  public HealthWatchersApiException(int httpStatusCode, String errorCode, String message) {
    super(message);
    this.httpStatusCode = httpStatusCode;
    this.errorCode = errorCode;
  }

  /** The HTTP status code of the response, e.g. 404, 409, 500. */
  public int getHttpStatusCode() {
    return httpStatusCode;
  }

  /** The API's error code string, e.g. "NotFound", "TimeSlotUnavailable". May be null. */
  public String getErrorCode() {
    return errorCode;
  }

  /**
   * Builds an exception (or the more specific {@link MfaRequiredException}) from a parsed
   * error response body of the shape {@code { error, message }}.
   */
  static HealthWatchersApiException fromErrorBody(int httpStatusCode, JsonObject json) {
    String errorCode = json.has("error") && !json.get("error").isJsonNull()
        ? json.get("error").getAsString()
        : null;
    String message = json.has("message") && !json.get("message").isJsonNull()
        ? json.get("message").getAsString()
        : "Health Watchers API request failed with HTTP " + httpStatusCode;
    return new HealthWatchersApiException(httpStatusCode, errorCode, message);
  }
}
