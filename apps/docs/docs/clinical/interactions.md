---
title: Drug Interactions
description: "Drug\u2013drug and drug\u2013food interaction checking against a locally cached interaction dataset, with drug-name resolution, refresh of the dataset, and usage analytics."
---

# Drug Interactions

Drug–drug and drug–food interaction checking against a locally cached interaction dataset, with drug-name resolution, refresh of the dataset, and usage analytics.

| | |
|---|---|
| **Base path** | `/api/v1/interactions` |
| **Source** | [`apps/api/src/modules/interactions/interaction.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/interactions/interaction.controller.ts) |

## Data model

- Drug, Interaction, FoodInteraction: interaction knowledge base
- InteractionCheckLog: audit of every check
- InteractionDataStatus: dataset freshness

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `POST` | `/api/v1/interactions/check` | Authenticated |
| `GET` | `/api/v1/interactions/resolve/:name` | Authenticated |
| `GET` | `/api/v1/interactions/drugs` | Authenticated |
| `POST` | `/api/v1/interactions/refresh` | Authenticated |
| `GET` | `/api/v1/interactions/data-status` | Authenticated |
| `GET` | `/api/v1/interactions/analytics` | Authenticated |
| `DELETE` | `/api/v1/interactions/cache` | Authenticated |

## Roles

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Related

- [Clinical Decision Support](/clinical/cds)
