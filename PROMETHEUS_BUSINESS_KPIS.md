# Prometheus Business KPIs Metrics

## Overview

This document describes the Prometheus metrics for business KPIs in Health Watchers. These metrics enable real-time monitoring of platform health and early detection of business anomalies.

## Metrics

### Payment Success Rate
**Metric**: `payment_success_rate`
**Type**: Gauge (0-1)
**Labels**: `clinicId`
**Description**: Payment success rate for a clinic

```promql
# View payment success rate by clinic
payment_success_rate

# Alert when below 95%
payment_success_rate < 0.95
```

### Encounter Duration
**Metric**: `encounter_duration_seconds`
**Type**: Histogram
**Labels**: `clinicId`
**Buckets**: 60s, 300s, 600s, 1800s, 3600s, 7200s, 14400s
**Description**: Duration of encounters in seconds

```promql
# View p95 encounter duration
histogram_quantile(0.95, encounter_duration_seconds_bucket)

# View p99 encounter duration
histogram_quantile(0.99, encounter_duration_seconds_bucket)
```

### Active Users
**Metric**: `active_users_total`
**Type**: Gauge
**Labels**: `clinicId`
**Description**: Total number of active users per clinic

```promql
# View active users by clinic
active_users_total

# Alert when no active users
active_users_total == 0
```

### API Key Requests
**Metric**: `api_key_requests_total`
**Type**: Counter
**Labels**: `apiKeyId`, `endpoint`
**Description**: Total API requests by API key and endpoint

```promql
# View request rate by API key
rate(api_key_requests_total[5m])

# View requests for specific endpoint
api_key_requests_total{endpoint="/api/v1/patients"}
```

### Stellar Transaction Fees
**Metric**: `stellar_transaction_fee_xlm`
**Type**: Histogram
**Labels**: `clinicId`, `transactionType`
**Buckets**: 0.00001, 0.0001, 0.001, 0.01, 0.1, 1, 10
**Description**: Stellar transaction fees in XLM

```promql
# View p95 transaction fee
histogram_quantile(0.95, stellar_transaction_fee_xlm_bucket)

# View average fee by transaction type
avg(stellar_transaction_fee_xlm_bucket) by (transactionType)
```

## Existing Metrics

### Patients Created
**Metric**: `patients_created_total`
**Type**: Counter
**Labels**: `clinicId`

### Encounters Created
**Metric**: `encounters_created_total`
**Type**: Counter
**Labels**: `clinicId`

### Payments Initiated
**Metric**: `payments_initiated_total`
**Type**: Counter
**Labels**: `currency`

### Payments Confirmed
**Metric**: `payments_confirmed_total`
**Type**: Counter
**Labels**: `currency`

## Usage

### Recording Metrics

```typescript
import {
  recordPaymentSuccessRate,
  recordEncounterDuration,
  updateActiveUsers,
  recordApiKeyRequest,
  recordStellarTransactionFee,
} from '@api/services/business-metrics.service';

// Record payment success rate
recordPaymentSuccessRate(clinicId, 0.95);

// Record encounter duration
recordEncounterDuration(clinicId, 1800); // 30 minutes

// Update active users
updateActiveUsers(clinicId, 42);

// Record API key request
recordApiKeyRequest(apiKeyId, '/api/v1/patients');

// Record Stellar transaction fee
recordStellarTransactionFee(clinicId, 'payment', 0.001);
```

### Calculating Success Rate

```typescript
import { updatePaymentSuccessRateFromCounts } from '@api/services/business-metrics.service';

// Calculate from confirmed and initiated counts
updatePaymentSuccessRateFromCounts(clinicId, 95, 100); // 95% success rate
```

## Grafana Dashboard

A pre-built Grafana dashboard is available at:
- **File**: `apps/api/src/monitoring/grafana-dashboard-kpis.json`
- **UID**: `health-watchers-kpis`

### Dashboard Panels

1. **Payment Success Rate** - Gauge showing current success rate by clinic
2. **Patients & Encounters Created** - Rate of creation over time
3. **Active Users by Clinic** - Current active users per clinic
4. **Encounter Duration** - p95 and p99 percentiles
5. **Stellar Transaction Fees** - p95 fees over time
6. **API Key Requests** - Request rate by API key and endpoint

### Importing Dashboard

1. Open Grafana
2. Go to Dashboards → Import
3. Upload `grafana-dashboard-kpis.json`
4. Select Prometheus data source
5. Click Import

## Alerting Rules

Prometheus alerting rules are defined in:
- **File**: `apps/api/src/monitoring/prometheus-alerts.yml`

### Alerts

| Alert | Condition | Severity | Duration |
|-------|-----------|----------|----------|
| PaymentSuccessRateLow | < 95% | Critical | 5m |
| PaymentSuccessRateVeryLow | < 90% | Critical | 2m |
| HighEncounterDuration | p95 > 1 hour | Warning | 10m |
| NoActiveUsers | 0 users | Warning | 30m |
| HighStellarTransactionFees | p95 > 1 XLM | Warning | 10m |

### Configuring Alerts

1. Add `prometheus-alerts.yml` to Prometheus configuration:
```yaml
rule_files:
  - '/etc/prometheus/prometheus-alerts.yml'
```

2. Restart Prometheus
3. Alerts will appear in Prometheus UI and Alertmanager

## Multi-Tenant Analysis

All metrics are labeled by `clinicId` for multi-tenant analysis:

```promql
# View metrics for specific clinic
payment_success_rate{clinicId="507f1f77bcf86cd799439011"}

# Compare across clinics
payment_success_rate

# Group by clinic
sum by (clinicId) (rate(patients_created_total[5m]))
```

## Performance Considerations

- Metrics are recorded synchronously during operations
- Histogram buckets are pre-defined to avoid cardinality explosion
- Gauges are updated on login/logout and payment completion
- Counters are incremented atomically

## Testing

Unit tests are available in:
- **File**: `apps/api/src/services/__tests__/business-metrics.service.test.ts`

Run tests:
```bash
npm test -- business-metrics.service.test.ts
```

## Integration Examples

See `metrics-integration-examples.ts` for examples of:
- Recording metrics in payment processing
- Recording metrics in encounter creation
- Recording metrics in authentication
- Recording metrics in API key usage
- Recording metrics in Stellar transactions

## Metrics Endpoint

All metrics are exposed at:
```
GET /metrics
```

Example response:
```
# HELP payment_success_rate Payment success rate (0-1)
# TYPE payment_success_rate gauge
payment_success_rate{clinicId="507f1f77bcf86cd799439011"} 0.95

# HELP encounter_duration_seconds Encounter duration in seconds
# TYPE encounter_duration_seconds histogram
encounter_duration_seconds_bucket{clinicId="507f1f77bcf86cd799439011",le="60"} 10
encounter_duration_seconds_bucket{clinicId="507f1f77bcf86cd799439011",le="300"} 45
...
```

## Troubleshooting

### Metrics not appearing
1. Check that metrics are being recorded in code
2. Verify `/metrics` endpoint is accessible
3. Check Prometheus scrape configuration
4. Look for errors in application logs

### High cardinality issues
1. Avoid using unbounded labels (e.g., user IDs)
2. Use `normalisePath()` for API paths
3. Pre-define histogram buckets
4. Monitor label combinations

### Alert not firing
1. Check alert rule syntax in `prometheus-alerts.yml`
2. Verify Prometheus is scraping metrics
3. Check alert evaluation in Prometheus UI
4. Verify Alertmanager configuration

## Future Enhancements

- Revenue per clinic metric
- Patient retention rate
- Clinic growth rate
- API latency by endpoint
- Database query performance metrics
- Cache hit rate metrics
