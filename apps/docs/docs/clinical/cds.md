---
title: Clinical Decision Support
description: "A rules engine (`cds-rules-engine.ts`) that evaluates vital-sign, drug-interaction, allergy, screening and care-gap rules when encounters are created, prescriptions are added, or vitals are recorded."
---

# Clinical Decision Support

A rules engine (`cds-rules-engine.ts`) that evaluates vital-sign, drug-interaction, allergy, screening and care-gap rules when encounters are created, prescriptions are added, or vitals are recorded. It returns alerts, recommendations, or blocking actions. Default rules are seeded by `cds-seed.ts`.

| | |
|---|---|
| **Base path** | `/api/v1/cds` |
| **Source** | [`apps/api/src/modules/cds/cds.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/cds/cds.controller.ts) |

## Data model

- CDSRule (`cds-rule.model.ts`): `ruleId`, `name`, `description`, `category` (`drug_interaction`, `screening`, `vital_sign`, `care_gap`, `allergy`), `trigger` (`encounter_create`, `prescription_add`, `vital_sign_record`), `conditions` (JSON), `action` (`type`: `alert` / `recommendation` / `block`; `severity`: `info` / `warning` / `critical`; `message`), `clinicId` (`null` = global rule), `isActive`

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v1/cds/rules` | Public |
| `POST` | `/api/v1/cds/rules` | Public |
| `PUT` | `/api/v1/cds/rules/:ruleId` | Public |
| `DELETE` | `/api/v1/cds/rules/:ruleId` | Public |
| `POST` | `/api/v1/cds/evaluate` | Public |

## Roles

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

:::note

The CDS router does not apply `authenticate` or a role guard itself. Only expose it behind the gateway authentication layer.

:::

## Related

- [Configuring CDS rules (user guide)](/user-guide/cds-rules-and-icd10-favourites)
- [Drug Interactions](/clinical/interactions)
