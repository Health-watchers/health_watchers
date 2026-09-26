package com.healthwatchers.sdk;

/**
 * Thrown by {@link HealthWatchersClient#login(String, String)} when the account has MFA
 * enabled. Corresponds to the API returning {@code { status: "mfa_required", data: {
 * mfaRequired: true, tempToken } } } from {@code POST /auth/login} (see
 * {@code apps/api/src/modules/auth/auth.controller.ts}).
 *
 * <p>The caller is expected to collect the user's MFA/TOTP code out of band and complete
 * login via the API's MFA verification endpoint using {@link #getTempToken()} (not wrapped
 * by this SDK yet); this exception simply surfaces the temp token needed for that step.
 */
public class MfaRequiredException extends HealthWatchersApiException {

  private final String tempToken;

  public MfaRequiredException(String tempToken) {
    super(200, "MfaRequired", "MFA verification is required to complete login.");
    this.tempToken = tempToken;
  }

  /** Short-lived token to be exchanged, together with the user's MFA code, for real tokens. */
  public String getTempToken() {
    return tempToken;
  }
}
