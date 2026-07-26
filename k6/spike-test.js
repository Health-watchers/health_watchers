import http from 'k6/http';
import { check, group, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '1m', target: 500 },
    { duration: '1m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  group('Spike - Patient Search', () => {
    http.get(`${BASE_URL}/api/v1/patients/search?q=test`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    });
  });

  sleep(0.2);

  group('Spike - Health Check', () => {
    http.get(`${BASE_URL}/api/v1/health`);
  });

  sleep(0.2);
}
