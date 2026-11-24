package com.healthwatchers.sdk.model;

/**
 * The {@code data} payload of a successful {@code POST /auth/login} response
 * (i.e. the user does not have MFA enabled, or is inside the MFA grace period).
 *
 * <p>Mirrors {@code apps/api/src/modules/auth/auth.controller.ts} (POST /auth/login,
 * success branch): {@code { accessToken, refreshToken }}, with {@code warning} and
 * {@code mfaGracePeriodEndsAt} present only while a required-role user is still inside
 * their MFA enrollment grace period.
 */
public class AuthTokens {
  public String accessToken;
  public String refreshToken;

  /** Present (value "mfa_required") only during the MFA enrollment grace period. */
  public String warning;

  /** ISO-8601 timestamp; present only alongside {@link #warning}. */
  public String mfaGracePeriodEndsAt;

  public String getAccessToken() {
    return accessToken;
  }

  public String getRefreshToken() {
    return refreshToken;
  }

  public String getWarning() {
    return warning;
  }

  public String getMfaGracePeriodEndsAt() {
    return mfaGracePeriodEndsAt;
  }

  @Override
  public String toString() {
    return "AuthTokens{accessToken=[redacted], refreshToken=[redacted], warning=" + warning + "}";
  }
}
