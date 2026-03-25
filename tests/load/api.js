import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 users over 30s
    { duration: '1m', target: 50 },    // Ramp up to 50 users over 1m
    { duration: '2m', target: 50 },    // Stay at 50 users for 2m
    { duration: '30s', target: 0 },    // Ramp down to 0 users over 30s
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'], // 95% of requests must complete below 500ms
    'http_req_failed': ['rate<0.001'],  // Error rate must be below 0.1%
    'http_reqs': ['rate>100'],          // Throughput must be above 100 req/s
    'errors': ['rate<0.001'],           // Custom error rate metric
  },
};

// Base URL - will be set via environment variable or default
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function() {
  // Test health endpoint
  const healthResponse = http.get(`${BASE_URL}/health`);
  
  const healthSuccess = check(healthResponse, {
    'health check status is 200': (r) => r.status === 200,
    'health check response time < 100ms': (r) => r.timings.duration < 100,
  });

  if (!healthSuccess) {
    errorRate.add(1);
  }

  // Test auth endpoints
  const authResponse = http.get(`${BASE_URL}/api/v1/auth`);
  
  const authSuccess = check(authResponse, {
    'auth endpoint status is 200 or 501': (r) => r.status === 200 || r.status === 501,
    'auth endpoint response time < 500ms': (r) => r.timings.duration < 500,
  });

  if (!authSuccess) {
    errorRate.add(1);
  }

  // Test patients endpoints
  const patientsResponse = http.get(`${BASE_URL}/api/v1/patients`);
  
  const patientsSuccess = check(patientsResponse, {
    'patients endpoint status is 200 or 501': (r) => r.status === 200 || r.status === 501,
    'patients endpoint response time < 500ms': (r) => r.timings.duration < 500,
  });

  if (!patientsSuccess) {
    errorRate.add(1);
  }

  // Test encounters endpoints
  const encountersResponse = http.get(`${BASE_URL}/api/v1/encounters`);
  
  const encountersSuccess = check(encountersResponse, {
    'encounters endpoint status is 200 or 501': (r) => r.status === 200 || r.status === 501,
    'encounters endpoint response time < 500ms': (r) => r.timings.duration < 500,
  });

  if (!encountersSuccess) {
    errorRate.add(1);
  }

  // Test payments endpoints
  const paymentsResponse = http.get(`${BASE_URL}/api/v1/payments`);
  
  const paymentsSuccess = check(paymentsResponse, {
    'payments endpoint status is 200 or 501': (r) => r.status === 200 || r.status === 501,
    'payments endpoint response time < 500ms': (r) => r.timings.duration < 500,
  });

  if (!paymentsSuccess) {
    errorRate.add(1);
  }

  // Test AI endpoints
  const aiResponse = http.get(`${BASE_URL}/api/v1/ai`);
  
  const aiSuccess = check(aiResponse, {
    'ai endpoint status is 200 or 501': (r) => r.status === 200 || r.status === 501,
    'ai endpoint response time < 500ms': (r) => r.timings.duration < 500,
  });

  if (!aiSuccess) {
    errorRate.add(1);
  }

  // Add delay between requests to simulate realistic user behavior
  sleep(0.5);
}

export function handleSummary(data) {
  console.log('API load test summary:', JSON.stringify(data, null, 2));
  
  return {
    stdout: JSON.stringify(data, null, 2),
    'api-load-test-results.json': JSON.stringify(data, null, 2),
  };
}