/**
 * Regression Baseline Test — Issue #1030
 *
 * This k6 script captures a named baseline measurement for each key
 * endpoint.  Run it once to capture the baseline, commit the thresholds,
 * and then run it again on every deploy to detect regressions.
 *
 * Usage:
 *   k6 run k6/regression-baseline.js \
 *     --env BASE_URL=http://localhost:3001 \
 *     --env AUTH_TOKEN=<jwt> \
 *     --out json=baseline-results.json
 *
 * The thresholds below represent the *committed* baseline.  Tighten them
 * as performance improves.
 */

import http from 'k6/http';
import { check, group } from 'k6';
import { Trend, Counter } from 'k6/metrics';

// ── Custom metrics (named per endpoint for regression tracking) ───────────────
const trends = {
  health: new Trend('baseline_health', true),
  patientList: new Trend('baseline_patient_list', true),
  patientSearch: new Trend('baseline_patient_search', true),
  patientSingle: new Trend('baseline_patient_single', true),
  encounterList: new Trend('baseline_encounter_list', true),
  appointmentList: new Trend('baseline_appointment_list', true),
  paymentList: new Trend('baseline_payment_list', true),
  dashboardStats: new Trend('baseline_dashboard_stats', true),
};
const failures = new Counter('baseline_failures');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const TOKEN = __ENV.AUTH_TOKEN || '';
const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

// ── Thresholds — committed baseline (ms) ──────────────────────────────────────
export const options = {
  scenarios: {
    baseline: {
      executor: 'constant-arrival-rate',
      rate: 5, // 5 requests/second per VU group
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 10,
    },
  },
  thresholds: {
    // Per-endpoint p95 budgets
    baseline_health: ['p(95)<100'],
    baseline_patient_list: ['p(95)<500'],
    baseline_patient_search: ['p(95)<600'],
    baseline_patient_single: ['p(95)<250'],
    baseline_encounter_list: ['p(95)<600'],
    baseline_appointment_list: ['p(95)<600'],
    baseline_payment_list: ['p(95)<600'],
    baseline_dashboard_stats: ['p(95)<1000'],
    // Global guards
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(99)<2000'],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function record(trend, res, name, expectedStatus = 200) {
  trend.add(res.timings.duration);
  const ok = check(res, {
    [`${name} status ${expectedStatus}`]: (r) => r.status === expectedStatus,
    [`${name} response time < 2000ms`]: (r) => r.timings.duration < 2000,
  });
  if (!ok) failures.add(1);
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function () {
  group('Health', () => {
    record(trends.health, http.get(`${BASE_URL}/health`), 'health');
  });

  group('Patient endpoints', () => {
    record(
      trends.patientList,
      http.get(`${BASE_URL}/api/v1/patients?page=1&limit=25`, { headers: HEADERS }),
      'patient list'
    );
    record(
      trends.patientSearch,
      http.get(`${BASE_URL}/api/v1/patients/search?q=test&limit=20`, { headers: HEADERS }),
      'patient search'
    );
  });

  group('Encounter endpoints', () => {
    record(
      trends.encounterList,
      http.get(`${BASE_URL}/api/v1/encounters?page=1&limit=25`, { headers: HEADERS }),
      'encounter list'
    );
  });

  group('Appointment endpoints', () => {
    record(
      trends.appointmentList,
      http.get(`${BASE_URL}/api/v1/appointments?page=1&limit=25`, { headers: HEADERS }),
      'appointment list'
    );
  });

  group('Payment endpoints', () => {
    record(
      trends.paymentList,
      http.get(`${BASE_URL}/api/v1/payments?page=1&limit=25`, { headers: HEADERS }),
      'payment list'
    );
  });

  group('Dashboard', () => {
    record(
      trends.dashboardStats,
      http.get(`${BASE_URL}/api/v1/dashboard/stats`, { headers: HEADERS }),
      'dashboard stats'
    );
  });
}

// ── Summary handler — prints JSON baseline for artifact capture ───────────────
export function handleSummary(data) {
  const baseline = {};
  for (const [key, metric] of Object.entries(data.metrics)) {
    if (key.startsWith('baseline_')) {
      baseline[key] = {
        p50: metric.values['p(50)'],
        p95: metric.values['p(95)'],
        p99: metric.values['p(99)'],
        avg: metric.values['avg'],
        max: metric.values['max'],
      };
    }
  }

  const summary = {
    timestamp: new Date().toISOString(),
    thresholdsPassed: Object.values(data.root_group?.checks ?? {}).every((c) => c.passes > 0),
    failures: data.metrics.baseline_failures?.values?.count ?? 0,
    baseline,
  };

  return {
    'baseline-summary.json': JSON.stringify(summary, null, 2),
    stdout: `\n[baseline] captured at ${summary.timestamp}\nfailures: ${summary.failures}\n`,
  };
}
