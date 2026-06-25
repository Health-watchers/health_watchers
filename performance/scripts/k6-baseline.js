import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const failedRequests = new Counter('failed_requests');
const patientListTrend = new Trend('patient_list_duration');
const encounterCreateTrend = new Trend('encounter_create_duration');
const paymentIntentTrend = new Trend('payment_intent_duration');
const healthCheckTrend = new Trend('health_check_duration');
const authLoginTrend = new Trend('auth_login_duration');
const clinicsListTrend = new Trend('clinics_list_duration');
const appointmentsListTrend = new Trend('appointments_list_duration');
const singlePatientTrend = new Trend('single_patient_duration');
const encountersListTrend = new Trend('encounters_list_duration');
const paymentsListTrend = new Trend('payments_list_duration');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const TOKEN = __ENV.AUTH_TOKEN || 'test-token';
const HEADERS = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

export const options = {
  scenarios: {
    baseline: {
      executor: 'constant-arrival-rate',
      rate: 10,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 20,
    },
  },
  thresholds: {
    patient_list_duration: ['p(95)<200'],
    encounter_create_duration: ['p(95)<500'],
    payment_intent_duration: ['p(95)<1000'],
    health_check_duration: ['p(95)<50'],
    http_req_failed: ['rate<0.01'],
  },
};

function record(response, trend, label, predicate) {
  trend.add(response.timings.duration);
  check(response, { [label]: predicate }) || failedRequests.add(1);
}

export default function () {
  record(
    http.get(`${BASE_URL}/api/v1/patients`, { headers: HEADERS }),
    patientListTrend,
    'patient list 200',
    (res) => res.status === 200
  );

  record(
    http.post(
      `${BASE_URL}/api/v1/encounters`,
      JSON.stringify({
        patientId: 'perf-test-patient',
        clinicId: 'perf-test-clinic',
        notes: 'perf test',
      }),
      { headers: HEADERS }
    ),
    encounterCreateTrend,
    'encounter create ok',
    (res) => [200, 201, 400, 404].includes(res.status)
  );

  record(
    http.post(
      `${BASE_URL}/api/v1/payments/intent`,
      JSON.stringify({ patientId: 'perf-test-patient', amount: 100, currency: 'USD' }),
      { headers: HEADERS }
    ),
    paymentIntentTrend,
    'payment intent ok',
    (res) => [200, 201, 400, 404].includes(res.status)
  );

  record(
    http.post(
      `${BASE_URL}/api/v1/auth/login`,
      JSON.stringify({ email: 'perf@test.com', password: 'testpass' }),
      { headers: HEADERS }
    ),
    authLoginTrend,
    'auth login non-500',
    (res) => res.status < 500
  );

  record(
    http.get(`${BASE_URL}/api/v1/clinics`, { headers: HEADERS }),
    clinicsListTrend,
    'clinics list non-500',
    (res) => res.status < 500
  );

  record(
    http.get(`${BASE_URL}/api/v1/appointments`, { headers: HEADERS }),
    appointmentsListTrend,
    'appointments list non-500',
    (res) => res.status < 500
  );

  record(
    http.get(`${BASE_URL}/api/v1/patients/perf-test-patient`, { headers: HEADERS }),
    singlePatientTrend,
    'single patient non-500',
    (res) => res.status < 500
  );

  record(http.get(`${BASE_URL}/health`), healthCheckTrend, 'health check ok', (res) => res.status === 200);

  record(
    http.get(`${BASE_URL}/api/v1/encounters`, { headers: HEADERS }),
    encountersListTrend,
    'encounters list non-500',
    (res) => res.status < 500
  );

  record(
    http.get(`${BASE_URL}/api/v1/payments`, { headers: HEADERS }),
    paymentsListTrend,
    'payments list non-500',
    (res) => res.status < 500
  );

  sleep(0.1);
}
