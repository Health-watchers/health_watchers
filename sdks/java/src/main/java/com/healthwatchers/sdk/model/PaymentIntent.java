package com.healthwatchers.sdk.model;

import java.util.List;

/**
 * Mirrors {@code PaymentResponse} produced by
 * {@code apps/api/src/modules/payments/payments.transformer.ts#toPaymentResponse}.
 *
 * <p>{@code platformPublicKey} and {@code feeBump} are only ever populated on the
 * {@code POST /payments/intent} response (they are merged in alongside the base
 * payment response there); {@code PATCH /payments/:intentId/confirm} returns the
 * base shape without them, so those two fields will be {@code null} after a confirm.
 */
public class PaymentIntent {
  public String id;
  public String intentId;
  public String patientId;

  /** Numeric string with up to 7 decimal places, e.g. "10.0000000". */
  public String amount;

  public String assetCode;
  public String assetIssuer;
  public String destination;
  public String memo;

  /** One of "pending", "confirmed", "failed". */
  public String status;

  public String txHash;

  /** ISO-8601 timestamp; present once confirmed. */
  public String confirmedAt;

  /** ISO-8601 timestamp. */
  public String createdAt;

  /** ISO-8601 timestamp. */
  public String updatedAt;

  // Path-payment fields (only set when the intent used a path payment).
  public String sourceAssetCode;
  public String sourceAssetIssuer;
  public String destinationAmount;
  public String maxSourceAmount;
  public List<String> path;

  /** Only present on the create-intent response. */
  public String platformPublicKey;

  /** Only present on the create-intent response, and only if a fee bump was generated. */
  public FeeBump feeBump;

  public static class FeeBump {
    public String xdr;
    public String hash;
    public Integer feeStroops;
  }

  @Override
  public String toString() {
    return "PaymentIntent{intentId=" + intentId + ", amount=" + amount + ", assetCode=" + assetCode
        + ", status=" + status + "}";
  }
}
