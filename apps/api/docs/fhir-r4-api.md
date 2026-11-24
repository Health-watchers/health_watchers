# FHIR R4 Read API

External systems can query patient data as [FHIR R4 (4.0.1)](https://hl7.org/fhir/R4/) resources at `/fhir/r4`. The API is read-only and scoped to the clinic that owns the API key.

## Endpoints

| Interaction | Request | Returns |
| --- | --- | --- |
| capabilities | `GET /fhir/r4/metadata` | `CapabilityStatement` (no auth) |
| read | `GET /fhir/r4/Patient/{id}` | `Patient` |
| search | `GET /fhir/r4/Patient?identifier=[system\|]value` | `Bundle` (searchset) |
| search | `GET /fhir/r4/Encounter?patient=Patient/{id}` | `Bundle` of `Encounter` |
| search | `GET /fhir/r4/Observation?patient=Patient/{id}&category=vital-signs` | `Bundle` of vital-sign `Observation` |

- The patient identifier system is `https://healthwatchers.com/patient-id` and the value is the clinic patient number (`HW-…`).
- Vital-sign Observations follow the R4 vital-signs profile: `category` is `vital-signs`, codes are LOINC, and blood pressure is a panel (`85354-9`) with systolic (`8480-6`) and diastolic (`8462-4`) components.
- Responses use `Content-Type: application/fhir+json`. Errors are `OperationOutcome` resources with the matching HTTP status (400 `invalid`, 401 `login`, 403 `forbidden`, 404 `not-found`, 429 `throttled`).

## Authentication and scopes

Create an API key in the clinic settings with one of these scopes:

| Scope | Grants |
| --- | --- |
| `patient/*.read` | Patient, Encounter and Observation |
| `patient/Patient.read` | Patient only |
| `patient/Encounter.read` | Encounter only |
| `patient/Observation.read` | Observation only |

Send the key as `Authorization: Bearer hw_…` (or `Authorization: ApiKey hw_…`). The per-key rate limit applies.

```bash
curl -H "Authorization: Bearer $HW_API_KEY" \
  "https://api.example.com/fhir/r4/Patient?identifier=https://healthwatchers.com/patient-id|HW-4F2A1C-000042"
```

## Paging

Search results come in pages of `_count` (1–100, default 20). Each `Bundle` has a `self` link and, when there are more results, a `next` link. Follow `next` as given; its `_cursor` parameter is opaque. `Bundle.total` is set for Patient and Encounter searches.

For Observation, `_count` counts encounters: each page contains the vital signs recorded on up to `_count` encounters.

## Auditing

Every request to `/fhir/r4`, including rejected ones, writes a `FHIR_ACCESS` audit entry with the API key, clinic, resource type, resource id or returned ids, query and HTTP status.

## Validation

`src/modules/fhir/__tests__/fhir.router.test.ts` validates every response against the official HL7 FHIR R4 JSON schema (`fixtures/fhir-r4-subset.schema.json`, extracted by `scripts/fhir/extract-r4-schema.js`). To check responses with the [HL7 FHIR validator](https://confluence.hl7.org/display/FHIR/Using+the+FHIR+Validator):

```bash
mkdir -p /tmp/fhir-dump
FHIR_DUMP_DIR=/tmp/fhir-dump npx jest src/modules/fhir
java -jar validator_cli.jar -version 4.0.1 /tmp/fhir-dump
```
