# Provider scheduling system (#1248)

Mounted at `/api/v1/provider-scheduling`.

## Models (`models/`)

| Model | Purpose |
|-------|---------|
| `ProviderAvailability` | per-provider weekly working hours + date overrides, slot length, buffer, daily cap |
| `ScheduleTemplate` | reusable weekly pattern that can be applied to many providers |
| `ShiftRotation` | cyclic rotation (`startDate` + `cycleLengthDays` + `pattern[]`) |
| `TimeOff` | provider time-off requests with an approval workflow |
| `OnCallSchedule` | primary / backup on-call windows |

## Logic

- **`slotting.ts`** (pure) — resolves a day's working blocks (override beats
  weekly pattern), chops them into fixed slots, and subtracts busy intervals.
  A candidate slot overlapping *any* appointment or approved time-off is
  dropped — this is what **prevents overbooking**.
- **`provider-scheduling.service.ts`** — ties the models together:
  `generateSlots`, `detectConflicts` / `assertSlotFree`, `applyTemplateToProviders`,
  `providerOnRotationDate`, `onCallForInstant`, `providerLoadForDay`,
  `pickLeastLoadedProvider` (load balancing).
- **`schedule-optimizer.ts`** (pure) — `assignDemand` spreads N requests across
  providers picking the least-loaded provider's earliest slot each step
  (minimises max wait, balances load); `compactDay` proposes pull-forward moves
  that shrink idle gaps and reports minutes saved.
- **`provider-scheduling.analytics.ts`** — provider utilization, no-show rate,
  and appointment lead-time / wait-time reports.

## Real-time

Availability changes and time-off approvals emit
`provider-scheduling:availability-updated` to the clinic room via Socket.IO.

## Endpoints

`POST/GET /availability`, `GET /slots`, `GET /conflicts`,
`POST/GET /templates`, `POST /templates/:id/apply`,
`POST /rotations`, `GET /rotations/:id/on-date`,
`POST/GET/PATCH /time-off`, `POST/GET /on-call`,
`POST /optimize`, `GET /analytics/{utilization,wait-times,load}`.
