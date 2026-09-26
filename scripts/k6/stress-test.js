import http from 'k6/http';
import { check, sleep } from 'k6';

const TARGET_URL = __ENV.K6_TARGET_URL || 'http://localhost:3000';

export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 2000,
      stages: [
        { duration: '1m', target: 50 },
        { duration: '2m', target: 200 },
        { duration: '2m', target: 500 },
        { duration: '2m', target: 1000 },
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.5'],
  },
};

export default function () {
  const res = http.get(`${TARGET_URL}/api/patients`);
  check(res, { 'status is not 5xx': (r) => r.status < 500 });
  sleep(0.5);
}
