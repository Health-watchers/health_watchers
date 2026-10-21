// API performance benchmark suite (issue #1319).
//
// Runs an isolated k6 scenario per critical endpoint so each one gets its own
// latency percentiles, throughput and error-rate measurement. Thresholds are
// derived from performance/baselines/baselines.json (single source of truth).
//
// Usage (from repo root):
//   k6 run performance/benchmarks/api-benchmarks.js \
//     --env BASE_URL=http://localhost:3001 \
//     --env AUTH_TOKEN=<token> \
//     --env PERF_EMAIL=doctor@example.com \
//     --env PERF_PASSWORD='Password123!' \
//     --summary-export=performance/results/summary.json
//
//   PERF_MODE=full  -> longer steady-state runs (default on nightly)
//   PERF_MODE=light -> short runs for PR checks

import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';
const EMAIL = __ENV.PERF_EMAIL || 'doctor@example.com';
const PASSWORD = __ENV.PERF_PASSWORD || 'Password123!';
const MODE = __ENV.PERF_MODE === 'full' ? 'full' : 'light';

const BASELINES = JSON.parse(open('../baselines/baselines.json'));
const THRESHOLD_PCT = Number(BASELINES.regression_threshold_percent || 20);

const DURATION = MODE === 'full' ? '30s' : '12s';
const VUS = MODE === 'full' ? 10 : 5;

const ENDPOINTS = [
  {
    key: 'health_check',
    name: 'Health check',
    method: 'GET',
    path: '/health',
    auth: false,
    vus: 8,
    traffic: 'baseline',
    expect: (res) => res.status === 200,
  },
  {
    key: 'auth_login',
    name: 'Authentication login',
    method: 'POST',
    path: '/api/v1/auth/login',
    auth: false,
    body: () => JSON.stringify({ email: EMAIL, password: PASSWORD }),
    headers: () => ({ 'Content-Type': 'application/json' }),
    vus: 4,
    traffic: 'light',
    expect: (res) => res.status === 200,
  },
  {
    key: 'patient_list',
    name: 'Patients list',
    method: 'GET',
    path: '/api/v1/patients',
    auth: true,
    vus: 12,
    traffic: 'full',
    expect: (res) => res.status === 200,
  },
  {
    key: 'patients_search',
    name: 'Patients search',
    method: 'GET',
    path: '/api/v1/patients/search?q=a',
    auth: true,
    vus: 10,
    traffic: 'full',
    expect: (res) => res.status === 200,
  },
  {
    key: 'appointments_list',
    name: 'Appointments list',
    method: 'GET',
    path: '/api/v1/appointments',
    auth: true,
    vus: 8,
    traffic: 'full',
    expect: (res) => res.status === 200,
  },
  {
    key: 'payments_list',
    name: 'Payments list',
    method: 'GET',
    path: '/api/v1/payments',
    auth: true,
    vus: 8,
    traffic: 'full',
    expect: (res) => res.status === 200,
  },
  {
    key: 'clinics_list',
    name: 'Clinics list',
    method: 'GET',
    path: '/api/v1/clinics',
    auth: true,
    vus: 6,
    traffic: 'light',
    expect: (res) => res.status === 200,
  },
];

const trends = {};
const counters = {};
const scenarios = {};
const thresholds = { http_req_failed: ['rate<0.01'] };

for (const ep of ENDPOINTS) {
  trends[ep.key] = new Trend(`${ep.key}_duration`);
  counters[ep.key] = new Counter(`${ep.key}_requests`);

  const baseline = BASELINES.baselines?.[`${ep.key}_duration`];
  if (typeof baseline === 'number') {
    const limit = baseline * (1 + THRESHOLD_PCT / 100);
    thresholds[`${ep.key}_duration`] = [`p(95)<${limit.toFixed(1)}`];
  }

  scenarios[ep.key] = {
    executor: 'constant-vus',
    vus: ep.traffic === 'light' || MODE === 'light' ? Math.min(ep.vus, VUS) : ep.vus,
    duration: DURATION,
    exec: `scenario_${ep.key}`,
    tags: { endpoint: ep.key },
  };
}

export const options = { scenarios, thresholds };

const AUTH_HEADERS = { Authorization: `Bearer ${AUTH_TOKEN}`, 'Content-Type': 'application/json' };

function run(ep) {
  const headers = ep.headers ? ep.headers() : AUTH_HEADERS;
  const body = ep.body ? ep.body() : null;
  const params = { headers, tags: { endpoint: ep.key } };

  const res =
    ep.method === 'GET'
      ? http.get(`${BASE_URL}${ep.path}`, params)
      : http.post(`${BASE_URL}${ep.path}`, body, params);

  trends[ep.key].add(res.timings.duration);
  counters[ep.key].add(1);
  check(res, { [`${ep.key} ${ep.method}`]: ep.expect });
}

for (const ep of ENDPOINTS) {
  exports[`scenario_${ep.key}`] = function () {
    run(ep);
  };
}
