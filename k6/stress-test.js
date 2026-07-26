import http from 'k6/http';
import { check, group, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

export const options = {
  stages: [
    { duration: '5m', target: 200 },
    { duration: '10m', target: 200 },
    { duration: '5m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<2000'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  group('Stress - Login', () => {
    http.post(`${BASE_URL}/api/v1/auth/login`, {
      email: `stress${Math.random()}@clinic.com`,
      password: 'TestPassword123!',
    });
  });

  sleep(0.5);

  group('Stress - Patient Search', () => {
    http.get(`${BASE_URL}/api/v1/patients/search?q=test`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    });
  });

  sleep(0.5);

  group('Stress - Create Encounter', () => {
    http.post(
      `${BASE_URL}/api/v1/encounters`,
      {
        patientId: '507f1f77bcf86cd799439011',
        chiefComplaint: 'Stress Test',
        notes: 'Stress testing encounter creation',
      },
      { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }
    );
  });

  sleep(0.5);
}
