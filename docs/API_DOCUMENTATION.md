# API Documentation

## Overview

Health Watchers provides a comprehensive REST API for managing healthcare data, payments, and patient records. The API follows RESTful conventions and uses JSON for all request/response payloads.

## Accessing API Documentation

### Interactive Swagger UI

Once the API server is running, access the interactive Swagger UI at:
```
http://localhost:3001/api/docs
```

The Swagger UI provides:
- Complete endpoint listing with method descriptions
- Request/response schemas
- Try-it-out functionality
- Parameter documentation
- Authentication setup

### OpenAPI Specification

The raw OpenAPI 3.0 specification is available at:
```
http://localhost:3001/api/swagger.json
```

## Base URL

```
http://localhost:3001/api/v1
```

Production: `https://api.healthwatchers.com/api/v1`

## Authentication

### JWT Bearer Token

Health Watchers uses JWT (JSON Web Tokens) for API authentication.

**Header:**
```
Authorization: Bearer <jwt_token>
```

**Obtaining a Token:**

1. Register a new account:
```bash
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "firstName": "John",
  "lastName": "Doe"
}
```

2. Login to receive access token:
```bash
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}

Response:
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "expiresIn": 3600
}
```

### Token Refresh

Access tokens expire after 1 hour. Use the refresh token to obtain a new access token:

```bash
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGc..."
}
```

### API Keys

For service-to-service communication, use API keys:

**Header:**
```
X-API-Key: <api_key>
```

**Create API Key:**
```bash
POST /api-keys
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Integration Service",
  "scopes": ["patients:read", "appointments:write"]
}
```

## Core Endpoints

### Patients

**List Patients:**
```
GET /patients?page=1&limit=10&clinicId=<clinicId>
```

**Get Patient:**
```
GET /patients/{id}
```

**Create Patient:**
```
POST /patients
Content-Type: application/json

{
  "firstName": "Jane",
  "lastName": "Smith",
  "dateOfBirth": "1990-01-15",
  "email": "jane@example.com",
  "clinicId": "<clinicId>"
}
```

**Update Patient:**
```
PUT /patients/{id}
```

**Delete Patient:**
```
DELETE /patients/{id}
```

### Encounters

**List Encounters:**
```
GET /encounters?patientId=<patientId>&page=1&limit=10
```

**Get Encounter:**
```
GET /encounters/{id}
```

**Create Encounter:**
```
POST /encounters
Content-Type: application/json

{
  "patientId": "<patientId>",
  "clinicId": "<clinicId>",
  "encounterType": "office_visit",
  "notes": "Annual checkup",
  "visitDate": "2026-06-27"
}
```

**Update Encounter:**
```
PUT /encounters/{id}
```

### Appointments

**List Appointments:**
```
GET /appointments?clinicId=<clinicId>&page=1&limit=10
```

**Get Appointment:**
```
GET /appointments/{id}
```

**Create Appointment:**
```
POST /appointments
Content-Type: application/json

{
  "patientId": "<patientId>",
  "providerId": "<providerId>",
  "clinicId": "<clinicId>",
  "startTime": "2026-07-01T09:00:00Z",
  "endTime": "2026-07-01T10:00:00Z",
  "appointmentType": "consultation"
}
```

**Update Appointment Status:**
```
PATCH /appointments/{id}/status
Content-Type: application/json

{
  "status": "confirmed"
}
```

### Payments

**List Payments:**
```
GET /payments?patientId=<patientId>&page=1&limit=10
```

**Get Payment:**
```
GET /payments/{id}
```

**Create Payment:**
```
POST /payments
Content-Type: application/json

{
  "invoiceId": "<invoiceId>",
  "amount": 150.00,
  "currency": "USD",
  "paymentMethod": "stellar",
  "stellarDestination": "<stellar_address>"
}
```

## Response Format

All successful responses return a JSON object:

```json
{
  "data": {
    "id": "65f123abc",
    "firstName": "John",
    "lastName": "Doe",
    "createdAt": "2026-06-27T10:00:00Z"
  },
  "meta": {
    "timestamp": "2026-06-27T10:00:00Z",
    "version": "1.0"
  }
}
```

## Pagination

List endpoints support pagination via query parameters:

```
GET /patients?page=1&limit=25&sort=-createdAt
```

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10, max: 100)
- `sort` - Sort field with optional `-` prefix for descending order

**Paginated Response:**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 25,
    "total": 150,
    "pages": 6
  }
}
```

## Error Handling

Error responses include an appropriate HTTP status code and error details:

```json
{
  "error": {
    "code": "PATIENT_NOT_FOUND",
    "message": "Patient with id '65f123abc' not found",
    "statusCode": 404
  }
}
```

**Common Status Codes:**
- `200` - OK
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate resource)
- `429` - Too Many Requests (rate limit)
- `500` - Internal Server Error

## Rate Limiting

The API enforces rate limits:
- **Per IP:** 100 requests per minute
- **Per User:** 1000 requests per hour
- **Authentication endpoints:** 5 requests per minute per IP

Rate limit headers are included in all responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1656334800
```

## Webhooks

Subscribe to events via webhooks for real-time notifications:

```bash
POST /webhooks
Content-Type: application/json
Authorization: Bearer <jwt_token>

{
  "url": "https://your-service.com/webhook",
  "events": ["patient.created", "appointment.scheduled", "payment.completed"]
}
```

**Event Types:**
- `patient.created`
- `patient.updated`
- `encounter.created`
- `appointment.scheduled`
- `appointment.cancelled`
- `payment.completed`
- `payment.failed`

## Postman Collection

A comprehensive Postman collection is available in `docs/postman/`:

1. `health-watchers.postman_collection.json` - All API requests
2. `health-watchers.postman_environment.json` - Environment variables

**Quick Start:**
1. Import both files into Postman
2. Set environment variables: `admin_email`, `admin_password`
3. Run **Auth → Login** request (token is auto-set)
4. Use any subsequent requests with automatic bearer authentication

## Request Examples

### Create Patient with Insurance

```bash
curl -X POST http://localhost:3001/api/v1/patients \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "dateOfBirth": "1985-05-10",
    "email": "john@example.com",
    "clinicId": "<clinicId>",
    "insurance": {
      "provider": "Blue Cross",
      "planName": "PPO Plus",
      "memberId": "BC123456789",
      "groupNumber": "G987654"
    }
  }'
```

### Create Encrypted Encounter

```bash
curl -X POST http://localhost:3001/api/v1/encounters \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": "<patientId>",
    "clinicId": "<clinicId>",
    "encounterType": "telemedicine",
    "notes": "Follow-up consultation",
    "visitDate": "2026-07-01",
    "diagnosis": {
      "primary": "I10",
      "secondary": ["E11.9"]
    },
    "vitals": {
      "temperature": 98.6,
      "bloodPressure": "120/80",
      "heartRate": 72,
      "respiratoryRate": 16
    }
  }'
```

### Process Stellar Payment

```bash
curl -X POST http://localhost:3001/api/v1/payments \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "invoiceId": "<invoiceId>",
    "amount": 250.00,
    "currency": "USDC",
    "paymentMethod": "stellar",
    "stellarDestination": "GBWBNMITAPYMXN5Y5JRKSNB3I2LKSVR4PNKFWN72Z6YWMYUNBQF2BFJY"
  }'
```

## HIPAA Compliance

All API endpoints enforce HIPAA compliance:
- End-to-end encryption for PHI (Protected Health Information)
- Audit logging for all data access
- Role-based access control (RBAC)
- Data anonymization options for research/analytics
- Automatic data expiration policies

**Accessing Encrypted Data:**
```bash
GET /patients/{id}?decrypt=true
Authorization: Bearer <token>
X-Encryption-Key: <key>
```

## Support & Resources

- **API Status:** `/health`
- **Rate Limit Info:** Response headers include `X-RateLimit-*`
- **Error Details:** Response body contains `error.code` for programmatic handling
- **Contact Support:** support@healthwatchers.com
