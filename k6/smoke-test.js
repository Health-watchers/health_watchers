import http from 'k6/http';
import { check, group, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

export const options = {
  stages: [{ duration: '1m', target: 1 }],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<2000'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  group('Smoke Test - Login', () => {
    const loginRes = http.post(`${BASE_URL}/api/v1/auth/login`, {
      email: 'test@clinic.com',
      password: 'TestPassword123!',
    });

    check(loginRes, {
      'login status is 200': (r) => r.status === 200,
      'login response time < 500ms': (r) => r.timings.duration < 500,
    });
  });

  sleep(1);

  group('Smoke Test - Patient Search', () => {
    const searchRes = http.get(`${BASE_URL}/api/v1/patients/search?q=test`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    });

    check(searchRes, {
      'search status is 200': (r) => r.status === 200,
      'search response time < 500ms': (r) => r.timings.duration < 500,
    });
  });

  sleep(1);

  group('Smoke Test - Health Check', () => {
    const healthRes = http.get(`${BASE_URL}/api/v1/health`);

    check(healthRes, {
      'health status is 200': (r) => r.status === 200,
    });
  });
}
