package com.healthwatchers.sdk.model;

import java.util.List;

/**
 * Request body for {@code POST /payments/intent}, matching {@code createPaymentIntentSchema}
 * in {@code apps/api/src/modules/payments/payments.validation.ts}.
 */
public class CreatePaymentIntentRequest {
  /** Optional. MongoDB ObjectId of the patient this payment is associated with. */
  public String patientId;

  /** Required. Numeric string with up to 7 decimal places, e.g. "10.0000000". */
  public String amount;

  /** Required. Stellar destination account public key. */
  public String destination;

  /** Optional memo attached to the on-chain transaction. */
  public String memo;

  /** Optional convenience field, one of "XLM"/"USDC" (server also accepts assetCode directly). */
  public String currency;

  /** Optional; defaults to "XLM" server-side if omitted. */
  public String assetCode;

  /** Optional; required by the server when assetCode is a non-XLM issued asset. */
  public String issuer;

  // Path-payment fields (all optional; only needed for cross-asset payments).
  public String sourceAssetCode;
  public String sourceAssetIssuer;
  public String destinationAmount;
  public String maxSourceAmount;
  public List<String> path;

  public CreatePaymentIntentRequest() {}

  public CreatePaymentIntentRequest(String amount, String destination) {
    this.amount = amount;
    this.destination = destination;
  }

  public CreatePaymentIntentRequest patientId(String patientId) {
    this.patientId = patientId;
    return this;
  }

  public CreatePaymentIntentRequest assetCode(String assetCode) {
    this.assetCode = assetCode;
    return this;
  }

  public CreatePaymentIntentRequest memo(String memo) {
    this.memo = memo;
    return this;
  }
}
