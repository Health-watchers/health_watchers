import http from 'k6/http';
import { check, group, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

export const options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '3m', target: 50 },
    { duration: '5m', target: 100 },
    { duration: '3m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<2000'],
    http_req_failed: ['rate<0.01'],
    'group_duration{group:::Patient Endpoints}': ['p(95)<1000'],
    'group_duration{group:::Encounter Endpoints}': ['p(95)<1500'],
    'group_duration{group:::Clinic Endpoints}': ['p(95)<500'],
  },
  ext: {
    loadimpact: {
      name: 'Load Test - Scalability',
      tags: { testType: 'loadTest' },
    },
  },
};

export default function () {
  group('Patient Endpoints', () => {
    const patientListRes = http.get(`${BASE_URL}/api/v1/patients?limit=20&skip=0`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    });

    check(patientListRes, {
      'list patients status is 200': (r) => r.status === 200,
      'list patients response time < 1000ms': (r) => r.timings.duration < 1000,
    });

    sleep(0.5);

    const patientCreateRes = http.post(
      `${BASE_URL}/api/v1/patients`,
      {
        firstName: `Patient_${Math.random()}`,
        lastName: 'TestLastName',
        email: `patient${Math.random()}@clinic.com`,
        dateOfBirth: '1990-01-01',
        gender: 'M',
        clinicId: '507f1f77bcf86cd799439011',
      },
      { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }
    );

    check(patientCreateRes, {
      'create patient status is 201': (r) => r.status === 201,
      'create patient response time < 1000ms': (r) => r.timings.duration < 1000,
    });
  });

  sleep(1);

  group('Encounter Endpoints', () => {
    const encounterListRes = http.get(`${BASE_URL}/api/v1/encounters?limit=20&skip=0`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    });

    check(encounterListRes, {
      'list encounters status is 200': (r) => r.status === 200,
      'list encounters response time < 1500ms': (r) => r.timings.duration < 1500,
    });

    sleep(0.5);

    const encounterCreateRes = http.post(
      `${BASE_URL}/api/v1/encounters`,
      {
        patientId: '507f1f77bcf86cd799439011',
        clinicId: '507f1f77bcf86cd799439012',
        chiefComplaint: 'Routine checkup',
        notes: 'Patient scheduled for annual physical',
        vitalSigns: {
          heartRate: 72,
          bloodPressure: '120/80',
          temperature: 37.0,
        },
      },
      { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }
    );

    check(encounterCreateRes, {
      'create encounter status is 201': (r) => r.status === 201,
      'create encounter response time < 1500ms': (r) => r.timings.duration < 1500,
    });
  });

  sleep(1);

  group('Clinic Endpoints', () => {
    const clinicListRes = http.get(`${BASE_URL}/api/v1/clinics?limit=10`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    });

    check(clinicListRes, {
      'list clinics status is 200': (r) => r.status === 200,
      'list clinics response time < 500ms': (r) => r.timings.duration < 500,
    });
  });

  sleep(2);
}
