package com.healthwatchers.sdk;

import com.google.gson.JsonObject;
import com.healthwatchers.sdk.model.CreatePaymentIntentRequest;
import com.healthwatchers.sdk.model.PaymentIntent;
import java.io.IOException;
import okhttp3.Request;

/**
 * Wraps the Stellar-backed {@code /payments} endpoints. Obtain via
 * {@link HealthWatchersClient#payments()}.
 */
public class PaymentsClient {

  private final HealthWatchersClient client;

  PaymentsClient(HealthWatchersClient client) {
    this.client = client;
  }

  /**
   * {@code POST /payments/intent} — creates a pending payment record and returns the intent id
   * plus the platform's Stellar public key (and, when available, a pre-built fee-bump
   * transaction) to use when submitting the actual on-chain transaction.
   */
  public PaymentIntent createIntent(CreatePaymentIntentRequest intentRequest)
      throws IOException, HealthWatchersApiException {
    Request request =
        client
            .newRequestBuilder("/payments/intent")
            .post(client.jsonBody(intentRequest))
            .build();
    return client.execute(request, PaymentIntent.class);
  }

  /**
   * {@code PATCH /payments/:intentId/confirm} — verifies the given Stellar transaction hash on
   * chain (memo, destination, amount and asset must match the original intent) and marks the
   * payment confirmed.
   */
  public PaymentIntent confirmIntent(String intentId, String txHash)
      throws IOException, HealthWatchersApiException {
    JsonObject body = new JsonObject();
    body.addProperty("txHash", txHash);

    Request request =
        client
            .newRequestBuilder("/payments/" + intentId + "/confirm")
            .patch(client.jsonBody(body))
            .build();
    return client.execute(request, PaymentIntent.class);
  }
}
