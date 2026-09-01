package com.healthwatchers.sdk;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Verifies the {@code X-Webhook-Signature} header that Health Watchers attaches to every
 * webhook delivery.
 *
 * <p>Mirrors {@code generateWebhookSignature} in
 * {@code apps/api/src/modules/webhooks/webhook.service.ts}:
 *
 * <pre>{@code
 * crypto.createHmac('sha256', secret).update(payload).digest('hex')
 * }</pre>
 *
 * i.e. the signature is the lowercase hex-encoded HMAC-SHA256 of the raw request body,
 * keyed with the webhook's registered secret. The comparison is done in constant time.
 */
public final class WebhookVerifier {

  private static final String HMAC_ALGORITHM = "HmacSHA256";

  private WebhookVerifier() {}

  /**
   * @param secret the webhook's secret, as issued when the webhook was registered
   * @param payload the exact raw request body bytes (as a String) received on the wire —
   *     do not re-serialize a parsed/re-encoded copy, or the signature will not match
   * @param signature the value of the incoming {@code X-Webhook-Signature} header
   * @return true if {@code signature} is a valid HMAC-SHA256 of {@code payload} under {@code secret}
   */
  public static boolean verifySignature(String secret, String payload, String signature) {
    if (secret == null || payload == null || signature == null) {
      return false;
    }
    String expectedHex = computeHexHmacSha256(secret, payload);
    // Constant-time comparison of the two hex digests, guarding against timing attacks.
    return MessageDigest.isEqual(
        expectedHex.getBytes(StandardCharsets.UTF_8),
        signature.getBytes(StandardCharsets.UTF_8));
  }

  private static String computeHexHmacSha256(String secret, String payload) {
    try {
      Mac mac = Mac.getInstance(HMAC_ALGORITHM);
      mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
      byte[] rawHmac = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
      return toHex(rawHmac);
    } catch (NoSuchAlgorithmException | InvalidKeyException e) {
      // HmacSHA256 is a standard JDK algorithm and the key is never empty by construction
      // upstream, so this should be unreachable in practice.
      throw new IllegalStateException("Unable to compute HMAC-SHA256 signature", e);
    }
  }

  private static String toHex(byte[] bytes) {
    StringBuilder hex = new StringBuilder(bytes.length * 2);
    for (byte b : bytes) {
      hex.append(Character.forDigit((b >> 4) & 0xF, 16));
      hex.append(Character.forDigit(b & 0xF, 16));
    }
    return hex.toString();
  }
}
