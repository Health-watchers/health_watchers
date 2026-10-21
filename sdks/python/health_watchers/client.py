"""HTTP client for the Health Watchers API.

This is a thin, dependency-light wrapper around ``requests`` that mirrors the
handful of endpoints most third-party integrations need: authentication,
patients, appointments, and payments. It is intentionally not a full
type-safe mirror of the API -- response payloads are returned as plain
``dict`` objects (as decoded from JSON) so the SDK stays small and doesn't
drift out of sync with the server's schemas.

Example:
    >>> from health_watchers import HealthWatchersClient
    >>> client = HealthWatchersClient(base_url="https://api.healthwatchers.com/api/v1")
    >>> client.login("doctor@example.com", "hunter2")
    >>> patient = client.patients.create(
    ...     first_name="Jane",
    ...     last_name="Doe",
    ...     date_of_birth="1990-01-01",
    ...     sex="female",
    ...     contact_number="+15551234567",
    ... )
"""

from __future__ import annotations

from typing import Any, Dict, Optional

import requests

__all__ = [
    "HealthWatchersError",
    "HealthWatchersAPIError",
    "HealthWatchersClient",
]

DEFAULT_TIMEOUT = 30  # seconds


class HealthWatchersError(Exception):
    """Base class for all errors raised by this SDK."""


class HealthWatchersAPIError(HealthWatchersError):
    """Raised when the Health Watchers API returns a non-2xx response.

    Attributes:
        status_code: The HTTP status code of the response.
        error: The ``error`` field from the API's JSON error body, if present.
        message: A human-readable message describing the failure.
        response: The raw ``requests.Response`` object, for callers that need
            to inspect headers (e.g. ``Retry-After`` on a 423 locked account).
    """

    def __init__(
        self,
        status_code: int,
        message: str,
        error: Optional[str] = None,
        response: Optional[requests.Response] = None,
    ) -> None:
        super().__init__(f"HTTP {status_code}: {message}")
        self.status_code = status_code
        self.message = message
        self.error = error
        self.response = response


def _raise_for_status(response: requests.Response) -> None:
    if response.ok:
        return
    message = f"Request failed with status {response.status_code}"
    error_code: Optional[str] = None
    try:
        body = response.json()
        if isinstance(body, dict):
            message = body.get("message") or message
            error_code = body.get("error")
    except ValueError:
        # Response body wasn't JSON (e.g. an HTML error page from a proxy).
        pass
    raise HealthWatchersAPIError(
        status_code=response.status_code,
        message=message,
        error=error_code,
        response=response,
    )


class _BaseResource:
    """Shared plumbing for resource sub-clients."""

    def __init__(self, client: "HealthWatchersClient") -> None:
        self._client = client

    def _request(self, method: str, path: str, **kwargs: Any) -> Dict[str, Any]:
        return self._client._request(method, path, **kwargs)


class PatientsResource(_BaseResource):
    """Access to the ``/patients`` endpoints."""

    def create(
        self,
        first_name: str,
        last_name: str,
        date_of_birth: str,
        sex: str,
        contact_number: Optional[str] = None,
        address: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Create a new patient record, scoped to the caller's clinic.

        Args:
            first_name: Patient's first name.
            last_name: Patient's last name.
            date_of_birth: ISO-8601 date string, e.g. ``"1990-01-01"``.
            sex: Patient's sex, e.g. ``"male"`` / ``"female"``.
            contact_number: Optional phone number.
            address: Optional address object.

        Returns:
            The API's ``data`` payload for the newly created patient.
        """
        body: Dict[str, Any] = {
            "firstName": first_name,
            "lastName": last_name,
            "dateOfBirth": date_of_birth,
            "sex": sex,
        }
        if contact_number is not None:
            body["contactNumber"] = contact_number
        if address is not None:
            body["address"] = address
        result = self._request("POST", "/patients", json=body)
        return result.get("data", result)

    def list(
        self,
        page: int = 1,
        limit: int = 20,
        clinic_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """List patients for the caller's clinic (paginated).

        Args:
            page: 1-indexed page number.
            limit: Page size (server caps this at 100).
            clinic_id: Only honored for SUPER_ADMIN callers; everyone else is
                scoped to their own clinic regardless of this value.

        Returns:
            A dict with ``data`` (list of patients) and ``pagination`` keys.
        """
        params: Dict[str, Any] = {"page": page, "limit": limit}
        if clinic_id is not None:
            params["clinicId"] = clinic_id
        return self._request("GET", "/patients", params=params)

    def get(self, patient_id: str) -> Dict[str, Any]:
        """Fetch a single patient by ID."""
        result = self._request("GET", f"/patients/{patient_id}")
        return result.get("data", result)


class AppointmentsResource(_BaseResource):
    """Access to the ``/appointments`` endpoints."""

    def create(
        self,
        patient_id: str,
        doctor_id: str,
        scheduled_at: str,
        duration: int = 30,
        type: Optional[str] = None,  # noqa: A002 - matches API field name
        chief_complaint: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Schedule a new appointment.

        Args:
            patient_id: The patient's ID.
            doctor_id: The doctor's ID.
            scheduled_at: ISO-8601 datetime string for the appointment start.
            duration: Duration in minutes (defaults to 30).
            type: Appointment type (e.g. ``"consultation"``, ``"follow_up"``).
            chief_complaint: Free-text reason for the visit.
            notes: Any additional notes.

        Returns:
            The API's ``data`` payload for the newly created appointment.
        """
        body: Dict[str, Any] = {
            "patientId": patient_id,
            "doctorId": doctor_id,
            "scheduledAt": scheduled_at,
            "duration": duration,
        }
        if type is not None:
            body["type"] = type
        if chief_complaint is not None:
            body["chiefComplaint"] = chief_complaint
        if notes is not None:
            body["notes"] = notes
        result = self._request("POST", "/appointments", json=body)
        return result.get("data", result)

    def list(
        self,
        doctor_id: Optional[str] = None,
        patient_id: Optional[str] = None,
        status: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ) -> Dict[str, Any]:
        """List appointments for the caller's clinic (paginated, filterable)."""
        params: Dict[str, Any] = {"page": page, "limit": limit}
        if doctor_id is not None:
            params["doctorId"] = doctor_id
        if patient_id is not None:
            params["patientId"] = patient_id
        if status is not None:
            params["status"] = status
        if date_from is not None:
            params["dateFrom"] = date_from
        if date_to is not None:
            params["dateTo"] = date_to
        return self._request("GET", "/appointments", params=params)


class PaymentsResource(_BaseResource):
    """Access to the ``/payments`` endpoints (Stellar-based payments)."""

    def create_intent(
        self,
        amount: str,
        destination: str,
        patient_id: Optional[str] = None,
        asset_code: str = "XLM",
        issuer: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a pending payment intent.

        Args:
            amount: Decimal amount as a string, e.g. ``"10.0000000"``.
            destination: The Stellar public key to receive the payment.
            patient_id: Optional patient to associate the payment with.
            asset_code: Stellar asset code (defaults to ``"XLM"``).
            issuer: Asset issuer address, required for non-native assets.
            idempotency_key: Optional key to safely retry intent creation.

        Returns:
            The API's ``data`` payload, including ``intentId``, ``memo``, and
            ``platformPublicKey`` needed to build the Stellar transaction.
        """
        body: Dict[str, Any] = {
            "amount": amount,
            "destination": destination,
            "assetCode": asset_code,
        }
        if patient_id is not None:
            body["patientId"] = patient_id
        if issuer is not None:
            body["issuer"] = issuer
        if idempotency_key is not None:
            body["idempotencyKey"] = idempotency_key
        result = self._request("POST", "/payments/intent", json=body)
        return result.get("data", result)

    def confirm_intent(self, intent_id: str, tx_hash: str) -> Dict[str, Any]:
        """Confirm a payment intent with the on-chain Stellar transaction hash.

        Args:
            intent_id: The ``intentId`` returned by :meth:`create_intent`.
            tx_hash: The Stellar transaction hash to verify against the intent.

        Returns:
            The API's ``data`` payload for the confirmed payment record.
        """
        result = self._request(
            "PATCH",
            f"/payments/{intent_id}/confirm",
            json={"txHash": tx_hash},
        )
        return result.get("data", result)


class HealthWatchersClient:
    """Main entry point for the Health Watchers Python SDK.

    Args:
        base_url: The API base URL, including the version prefix, e.g.
            ``"https://api.healthwatchers.com/api/v1"``.
        api_key: An API key for service-to-service auth. Sent as the
            ``X-API-Key`` header on every request. Mutually usable alongside
            (but typically instead of) ``access_token``.
        access_token: A JWT access token, e.g. obtained via :meth:`login` or
            issued out-of-band. Sent as ``Authorization: Bearer <token>``.
        timeout: Default request timeout in seconds.

    Resource accessors:
        - ``client.patients`` -> :class:`PatientsResource`
        - ``client.appointments`` -> :class:`AppointmentsResource`
        - ``client.payments`` -> :class:`PaymentsResource`
    """

    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        access_token: Optional[str] = None,
        timeout: int = DEFAULT_TIMEOUT,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._access_token: Optional[str] = access_token
        self._api_key: Optional[str] = api_key
        self.session = requests.Session()
        self._apply_auth_headers()

        self.patients = PatientsResource(self)
        self.appointments = AppointmentsResource(self)
        self.payments = PaymentsResource(self)

    # -- auth -----------------------------------------------------------

    @property
    def access_token(self) -> Optional[str]:
        return self._access_token

    @access_token.setter
    def access_token(self, value: Optional[str]) -> None:
        self._access_token = value
        self._apply_auth_headers()

    @property
    def api_key(self) -> Optional[str]:
        return self._api_key

    @api_key.setter
    def api_key(self, value: Optional[str]) -> None:
        self._api_key = value
        self._apply_auth_headers()

    def _apply_auth_headers(self) -> None:
        self.session.headers.pop("Authorization", None)
        self.session.headers.pop("X-API-Key", None)
        if self._access_token:
            self.session.headers["Authorization"] = f"Bearer {self._access_token}"
        if self._api_key:
            self.session.headers["X-API-Key"] = self._api_key

    def login(self, email: str, password: str) -> Dict[str, Any]:
        """Authenticate with email/password and store the resulting access token.

        On success (no MFA required), the returned dict looks like::

            {"status": "success", "data": {"accessToken": "...", "refreshToken": "..."}}

        and this client's ``access_token`` is updated automatically so
        subsequent requests are authenticated.

        If the account has MFA enabled, the server instead responds with::

            {"status": "mfa_required", "data": {"mfaRequired": True, "tempToken": "..."}}

        In that case no access token is available yet -- the caller must
        complete the MFA challenge out-of-band (e.g. ``POST /auth/mfa/verify``
        with the ``tempToken``) and then set ``client.access_token`` manually
        with the resulting token. This method does not raise in that case;
        callers should check ``response["status"] == "mfa_required"`` (or the
        presence of ``response["data"]["mfaRequired"]``).

        Args:
            email: The user's email address.
            password: The user's password.

        Returns:
            The parsed JSON response body (see above for both shapes).
        """
        response = self._request(
            "POST",
            "/auth/login",
            json={"email": email, "password": password},
        )
        data = response.get("data") or {}
        if response.get("status") == "mfa_required" or data.get("mfaRequired"):
            return response
        access_token = data.get("accessToken")
        if access_token:
            self.access_token = access_token
        return response

    # -- transport --------------------------------------------------------

    def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        response = self.session.request(
            method,
            url,
            params=params,
            json=json,
            timeout=self.timeout,
        )
        _raise_for_status(response)
        if not response.content:
            return {}
        return response.json()
