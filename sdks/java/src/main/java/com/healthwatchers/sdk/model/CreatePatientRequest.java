package com.healthwatchers.sdk.model;

/**
 * Request body for {@code POST /patients}, matching {@code createPatientSchema} in
 * {@code apps/api/src/modules/patients/patients.validation.ts}.
 *
 * <p>{@code clinicId} is intentionally not a field here: the API always scopes a new
 * patient to the caller's own clinic (derived from the auth token / API key) and
 * ignores any client-supplied clinic id.
 */
public class CreatePatientRequest {
  public String firstName;
  public String lastName;

  /** ISO-8601 date string, e.g. "1990-05-14". Must not be in the future. */
  public String dateOfBirth;

  /** One of "M", "F", "O". */
  public String sex;

  /** Optional. E.164 or common local phone format. */
  public String contactNumber;

  /** Optional. */
  public String address;

  public CreatePatientRequest() {}

  public CreatePatientRequest(String firstName, String lastName, String dateOfBirth, String sex) {
    this.firstName = firstName;
    this.lastName = lastName;
    this.dateOfBirth = dateOfBirth;
    this.sex = sex;
  }

  public CreatePatientRequest contactNumber(String contactNumber) {
    this.contactNumber = contactNumber;
    return this;
  }

  public CreatePatientRequest address(String address) {
    this.address = address;
    return this;
  }
}
