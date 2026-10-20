"""Health Watchers Python SDK.

A small, dependency-light client for the Health Watchers API
(https://api.healthwatchers.com/api/v1), built on top of ``requests``.

    from health_watchers import HealthWatchersClient

    client = HealthWatchersClient(base_url="https://api.healthwatchers.com/api/v1")
    client.login("doctor@example.com", "hunter2")
    patient = client.patients.create(
        first_name="Jane",
        last_name="Doe",
        date_of_birth="1990-01-01",
        sex="female",
    )
"""

from .client import HealthWatchersAPIError, HealthWatchersClient, HealthWatchersError
from .webhooks import compute_webhook_signature, verify_webhook_signature

__version__ = "0.1.0"

__all__ = [
    "HealthWatchersClient",
    "HealthWatchersError",
    "HealthWatchersAPIError",
    "verify_webhook_signature",
    "compute_webhook_signature",
    "__version__",
]
