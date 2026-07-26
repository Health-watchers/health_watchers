import http from 'k6/http';
import { check, group, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '5m', target: 50 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<2000'],
    http_req_failed: ['rate<0.01'],
    'group_duration{group:::Login}': ['p(95)<500'],
    'group_duration{group:::Patient Search}': ['p(95)<500'],
    'group_duration{group:::Create Encounter}': ['p(95)<1000'],
  },
};

export default function () {
  group('Login', () => {
    const loginRes = http.post(`${BASE_URL}/api/v1/auth/login`, {
      email: `user${Math.random()}@clinic.com`,
      password: 'TestPassword123!',
    });

    check(loginRes, {
      'login status is 200': (r) => r.status === 200,
      'login response time < 500ms': (r) => r.timings.duration < 500,
    });
  });

  sleep(1);

  group('Patient Search', () => {
    const searchRes = http.get(`${BASE_URL}/api/v1/patients/search?q=test&limit=20`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    });

    check(searchRes, {
      'search status is 200': (r) => r.status === 200,
      'search response time < 500ms': (r) => r.timings.duration < 500,
    });
  });

  sleep(1);

  group('Create Encounter', () => {
    const encounterRes = http.post(
      `${BASE_URL}/api/v1/encounters`,
      {
        patientId: '507f1f77bcf86cd799439011',
        chiefComplaint: 'Headache',
        notes: 'Patient reports mild headache',
        vitalSigns: {
          heartRate: 72,
          bloodPressure: '120/80',
          temperature: 37,
        },
      },
      { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }
    );

    check(encounterRes, {
      'encounter status is 201': (r) => r.status === 201,
      'encounter response time < 1000ms': (r) => r.timings.duration < 1000,
    });
  });

  sleep(2);
}
