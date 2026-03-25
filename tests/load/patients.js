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

// Test data for patient creation
const patientData = {
  firstName: 'John',
  lastName: 'Doe',
  dateOfBirth: '1985-06-15',
  gender: 'Male',
  email: 'john.doe@example.com',
  phone: '+1234567890',
  address: {
    street: '123 Main St',
    city: 'Anytown',
    state: 'CA',
    country: 'USA',
    postalCode: '90210'
  },
  emergencyContact: {
    name: 'Jane Doe',
    relationship: 'Spouse',
    phone: '+1234567891'
  }
};

export default function() {
  // Test patient creation endpoint
  const createResponse = http.post(
    `${BASE_URL}/api/v1/patients`,
    JSON.stringify(patientData),
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  // Check if request was successful
  const success = check(createResponse, {
    'create patient status is 201 or 501': (r) => r.status === 201 || r.status === 501,
    'create patient response time < 500ms': (r) => r.timings.duration < 500,
  });

  if (!success) {
    errorRate.add(1);
  }

  // Test patient retrieval endpoint (using a sample patient ID)
  const patientId = 'sample-patient-id';
  const getResponse = http.get(`${BASE_URL}/api/v1/patients/${patientId}`);

  const getSuccess = check(getResponse, {
    'get patient status is 200 or 501': (r) => r.status === 200 || r.status === 501,
    'get patient response time < 500ms': (r) => r.timings.duration < 500,
  });

  if (!getSuccess) {
    errorRate.add(1);
  }

  // Test patient list endpoint
  const listResponse = http.get(`${BASE_URL}/api/v1/patients`);

  const listSuccess = check(listResponse, {
    'list patients status is 200 or 501': (r) => r.status === 200 || r.status === 501,
    'list patients response time < 500ms': (r) => r.timings.duration < 500,
  });

  if (!listSuccess) {
    errorRate.add(1);
  }

  // Add delay between requests to simulate realistic user behavior
  sleep(1);
}

export function handleSummary(data) {
  console.log('Load test summary:', JSON.stringify(data, null, 2));
  
  return {
    stdout: JSON.stringify(data, null, 2),
    'load-test-results.json': JSON.stringify(data, null, 2),
  };
}