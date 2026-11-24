# Data Anonymization Design

## Overview

The data anonymization subsystem protects patient privacy across three data
surfaces:

1. **Research data exports** (`research.controller.ts`)
2. **Aggregate reports**
3. **FHIR export pipeline**

The implementation lives in `packages/anonymize/src/index.ts`. This document
describes the anonymization levels, the algorithms and parameters used, the
integration points, and the re-identification risk thresholds that must be
satisfied.

## Anonymization Levels

The package exposes three levels of anonymization, selected per data surface.

### Level 1 — Pseudonymization

- Direct identifiers (names, MRNs, addresses, phone numbers, emails) are
  replaced with stable, salted hashes (pseudonyms).
- The salt is stored separately from the data and never exported.
- Pseudonyms are consistent within a dataset so records can still be linked
  internally, but cannot be trivially re-linked to the source system.
- Suitable for internal analytics where record-level linkage is required.

### Level 2 — k-Anonymity (with generalization and suppression)

- Quasi-identifiers (QIs) are generalized into ranges/buckets so that every
  record is indistinguishable from at least `k - 1` other records on the QI
  set.
- Records that cannot satisfy the threshold are suppressed.
- Suitable for research data exports.

### Level 3 — Differential Privacy (aggregate only)

- Aggregate statistics are computed and then perturbed with calibrated noise
  so that the presence/absence of any single record has a bounded effect on
  the output.
- Suitable for aggregate reports and dashboards.

## k-Anonymity Algorithm and Parameters

### Quasi-identifiers

The default quasi-identifier set for research exports is:

| QI            | Generalization                                              |
| ------------- | ----------------------------------------------------------- |
| `age`         | Bucketed into 5-year ranges (e.g. `30-34`)                  |
| `gender`      | Kept as-is (low cardinality)                                |
| `postalCode`  | Truncated to first 3 characters (e.g. `123**`)              |
| `birthDate`   | Reduced to birth year, then bucketed into 5-year ranges     |

The QI set and generalization rules are configurable via
`AnonymizeConfig.quasiIdentifiers`.

### k Threshold

- Default `k = 5`.
- Configurable via `AnonymizeConfig.k`.
- A value of `k < 3` is rejected by the package to prevent weak anonymity.

### Algorithm

1. **Generalize** each QI according to its rule.
2. **Group** records by the generalized QI tuple.
3. **Suppress** any group whose size is `< k`.
4. **Report** the suppression rate; if the suppression rate exceeds
   `maxSuppressionRate` (default `0.10`), the export fails rather than
   silently dropping too much data.

The result is a dataset where every retained record shares its generalized QI
tuple with at least `k - 1` others.

## Differential Privacy Mechanism

### Mechanism

- **Laplace mechanism** is the default, used for count and sum queries.
- **Gaussian mechanism** is available for queries where a bounded
  `(epsilon, delta)` guarantee is preferred (e.g. mean estimation).

### Parameters

| Parameter   | Default | Notes                                              |
| ----------- | ------- | -------------------------------------------------- |
| `epsilon`   | `1.0`   | Privacy budget per report. Lower = more privacy.   |
| `delta`     | `1e-5`  | Only used by the Gaussian mechanism.               |
| `sensitivity` | query-specific | Global sensitivity of the aggregate function. |

Noise scale:

- Laplace: `scale = sensitivity / epsilon`
- Gaussian: `sigma = sqrt(2 * ln(1.25 / delta)) * sensitivity / epsilon`

The privacy budget is tracked per report; composing multiple queries consumes
budget according to the basic composition theorem.

## FHIR Export Integration

Anonymization is applied inside the FHIR export pipeline at the following
points:

1. **Resource scrubbing** — before serialization, `Patient`, `Practitioner`,
   and related resources have direct identifiers replaced with pseudonyms
   (Level 1).
2. **QI generalization** — `Patient.birthDate`, `Patient.gender`, and address
   postal codes are generalized (Level 2) when the export is flagged as a
   research export.
3. **Aggregate summaries** — any aggregate counts included in the export
   bundle are perturbed with differential privacy noise (Level 3).

Integration hooks:

- `anonymizeFhirBundle(bundle, config)` — entry point invoked by the FHIR
  exporter.
- The exporter must pass an `AnonymizeConfig` describing the desired level and
  parameters; defaults are applied when omitted.

## Re-identification Risk Thresholds

A dataset is considered safe to export only if it meets all of the following:

| Metric                          | Threshold        |
| ------------------------------- | ---------------- |
| Minimum group size (k)          | `>= 5`           |
| Suppression rate                | `<= 10%`         |
| Estimated re-identification risk | `< 0.05`        |

The estimated re-identification risk is computed as the proportion of records
whose generalized QI tuple is unique or near-unique (group size below `k`).
Exports exceeding any threshold are rejected with an error describing which
threshold failed.

A verification test dataset is maintained to assert that the computed risk
stays below `0.05` for the standard configuration.

## Configuration Reference

```ts
interface AnonymizeConfig {
  level: 'pseudonymize' | 'k-anonymity' | 'differential-privacy';
  k?: number;                    // default 5, minimum 3
  quasiIdentifiers?: string[];   // default QI set above
  maxSuppressionRate?: number;   // default 0.10
  epsilon?: number;              // default 1.0
  delta?: number;                // default 1e-5
  mechanism?: 'laplace' | 'gaussian'; // default 'laplace'
  salt?: string;                 // required for pseudonymization
}
```