"""Helpers for verifying Health Watchers webhook deliveries.

Every webhook delivery is signed with HMAC-SHA256 using the webhook's shared
secret (configured when the webhook was registered) and the raw JSON request
body. The signature is sent as a hex digest in the ``X-Webhook-Signature``
header. Recipients should recompute the signature from the raw request body
and compare it using a constant-time comparison before trusting the payload.

Example (e.g. inside a Flask/Django/FastAPI webhook handler):

    >>> from health_watchers.webhooks import verify_webhook_signature
    >>> raw_body = request.get_data(as_text=True)  # the *raw* request body
    >>> signature = request.headers.get("X-Webhook-Signature", "")
    >>> if not verify_webhook_signature(webhook_secret, raw_body, signature):
    ...     raise ValueError("Invalid webhook signature")
"""

from __future__ import annotations

import hashlib
import hmac

__all__ = ["compute_webhook_signature", "verify_webhook_signature"]


def compute_webhook_signature(secret: str, payload: str) -> str:
    """Compute the expected HMAC-SHA256 hex digest for a webhook payload.

    This mirrors the server-side ``generateWebhookSignature`` implementation:
    ``crypto.createHmac('sha256', secret).update(payload).digest('hex')``.

    Args:
        secret: The webhook's shared secret.
        payload: The *raw* request body string (exactly as received, before
            any JSON re-serialization -- re-serializing can change field
            ordering/whitespace and produce a mismatched signature).

    Returns:
        The hex-encoded HMAC-SHA256 signature.
    """
    return hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def verify_webhook_signature(secret: str, payload: str, signature: str) -> bool:
    """Verify a webhook's ``X-Webhook-Signature`` header value.

    Uses a constant-time comparison to avoid leaking timing information that
    could help an attacker forge a valid signature.

    Args:
        secret: The webhook's shared secret.
        payload: The raw request body string that was signed.
        signature: The value of the incoming ``X-Webhook-Signature`` header.

    Returns:
        ``True`` if the signature matches the expected HMAC, ``False``
        otherwise (including if ``signature`` is malformed).
    """
    expected = compute_webhook_signature(secret, payload)
    try:
        return hmac.compare_digest(expected, signature)
    except TypeError:
        # signature wasn't a str (e.g. None) -- treat as invalid rather than raising.
        return False
