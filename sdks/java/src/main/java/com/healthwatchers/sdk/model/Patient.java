package com.healthwatchers.sdk.model;

import java.util.List;

/**
 * Mirrors {@code PatientResponse} produced by
 * {@code apps/api/src/modules/patients/patients.transformer.ts#toPatientResponse}.
 *
 * <p>Note: the list endpoint ({@code GET /patients}) returns a trimmed projection of
 * this shape (no {@code allergies}/{@code insurance}/{@code photoUrl}/etc.) so those
 * fields will simply be {@code null} on list results; the single-resource endpoints
 * ({@code POST /patients}, {@code GET /patients/:id}) return the full shape.
 */
public class Patient {
  public String id;
  public String systemId;
  public String firstName;
  public String lastName;

  /** ISO-8601 date string, e.g. "1990-05-14". */
  public String dateOfBirth;

  /** One of "M", "F", "O". */
  public String sex;

  public String contactNumber;
  public String address;
  public List<Object> allergies;
  public List<Object> insurance;

  /** ISO-8601 timestamp. */
  public String createdAt;

  /** ISO-8601 timestamp. */
  public String updatedAt;

  public String photoUrl;
  public String thumbnailUrl;
  public Integer age;
  public String ageGroup;

  @Override
  public String toString() {
    return "Patient{id=" + id + ", systemId=" + systemId + ", firstName=" + firstName
        + ", lastName=" + lastName + "}";
  }
}
