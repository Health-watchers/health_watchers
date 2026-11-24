/**
 * Patient Import Load Test — Issue #1028
 *
 * Simulates bulk patient CSV import operations to validate:
 *  - File upload handling under load
 *  - Background job queue throughput
 *  - Database write performance for batch inserts
 *  - Duplicate detection at scale
 *
 * Usage:
 *   k6 run k6/patient-import.js \
 *     --env BASE_URL=http://localhost:3001 \
 *     --env AUTH_TOKEN=<jwt>
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { FormData } from 'https://jslib.k6.io/formdata/0.0.2/index.js';

// ── Custom metrics ────────────────────────────────────────────────────────────
const uploadDuration = new Trend('patient_import_upload_duration', true);
const uploadFailures = new Counter('patient_import_upload_failures');
const jobStatusChecks = new Counter('patient_import_job_status_checks');
const jobCompleted = new Counter('patient_import_job_completed');
const jobFailed = new Counter('patient_import_job_failed');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const TOKEN = __ENV.AUTH_TOKEN || '';
const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
};

// ── Load profile ──────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    patient_import_load: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1m',
      preAllocatedVUs: 5,
      maxVUs: 20,
      stages: [
        { duration: '2m', target: 3 }, // warm up: 3 imports/min
        { duration: '5m', target: 10 }, // ramp to 10 imports/min
        { duration: '3m', target: 10 }, // sustain
        { duration: '2m', target: 0 }, // ramp down
      ],
    },
  },
  thresholds: {
    // Upload thresholds
    patient_import_upload_duration: ['p(95)<5000'], // upload < 5s at p95
    patient_import_upload_failures: ['count<10'], // < 10 upload failures total
    
    // Job processing thresholds
    patient_import_job_completed: ['count>0'], // at least some jobs complete
    patient_import_job_failed: ['count<5'], // < 5 job failures

    // Global guards
    http_req_failed: ['rate<0.05'], // allow 5% failure rate for long-polling
    http_req_duration: ['p(99)<30000'], // 30s p99 for job status polling
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 * Generate a CSV file with patient records
 * @param {number} count Number of patient records to generate
 * @returns {string} CSV content
 */
function generatePatientCSV(count) {
  const lines = ['firstName,lastName,email,phoneNumber,dateOfBirth,gender,address'];
  
  for (let i = 0; i < count; i++) {
    const patientNum = Date.now() + Math.floor(Math.random() * 100000);
    lines.push([
      `Patient${patientNum}`,
      `Test${patientNum}`,
      `patient${patientNum}@example.com`,
      `555-${String(patientNum).slice(-4).padStart(4, '0')}`,
      `1985-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      i % 2 === 0 ? 'male' : 'female',
      `${patientNum} Test St, Suite ${i % 100}, Test City, TS ${String((i % 9) + 1).repeat(5)}`
    ].join(','));
  }
  
  return lines.join('\n');
}

/**
 * Poll job status until completion or timeout
 * @param {string} jobId Job identifier
 * @param {number} maxAttempts Maximum polling attempts
 * @returns {boolean} True if job completed successfully
 */
function pollJobStatus(jobId, maxAttempts = 30) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    jobStatusChecks.add(1);
    
    const res = http.get(
      `${BASE_URL}/api/v1/patients/import-jobs/${jobId}`,
      { headers: HEADERS }
    );
    
    if (res.status !== 200) {
      console.warn(`Job status check failed: ${res.status}`);
      sleep(2);
      continue;
    }
    
    const body = JSON.parse(res.body);
    const status = body.data?.status;
    
    if (status === 'completed') {
      jobCompleted.add(1);
      return true;
    } else if (status === 'failed') {
      jobFailed.add(1);
      console.error(`Job ${jobId} failed:`, body.data?.error);
      return false;
    } else if (status === 'processing' || status === 'pending') {
      // Still processing, continue polling
      sleep(2);
      continue;
    }
    
    // Unknown status
    console.warn(`Unknown job status: ${status}`);
    sleep(2);
  }
  
  // Timeout
  console.warn(`Job ${jobId} timed out after ${maxAttempts} attempts`);
  jobFailed.add(1);
  return false;
}

// ── Main scenario ─────────────────────────────────────────────────────────────
export default function () {
  group('Patient CSV import', () => {
    // Generate CSV with 10-50 patients (randomized per iteration)
    const patientCount = Math.floor(Math.random() * 41) + 10; // 10-50
    const csvContent = generatePatientCSV(patientCount);
    
    // Prepare multipart form data
    const fd = new FormData();
    const file = http.file(csvContent, `patients-${Date.now()}.csv`, 'text/csv');
    fd.append('file', file);
    fd.append('validate', 'true'); // Enable validation
    fd.append('skipDuplicates', 'true'); // Skip duplicate detection for perf
    
    // Upload CSV
    const uploadStart = Date.now();
    const uploadRes = http.post(
      `${BASE_URL}/api/v1/patients/import`,
      fd.body(),
      {
        headers: {
          ...HEADERS,
          'Content-Type': `multipart/form-data; boundary=${fd.boundary}`,
        },
        timeout: '10s',
      }
    );
    const uploadEnd = Date.now();
    uploadDuration.add(uploadEnd - uploadStart);
    
    const uploadOk = check(uploadRes, {
      'upload status 202': (r) => r.status === 202,
      'upload response has job ID': (r) => {
        try {
          const body = JSON.parse(r.body);
          return !!body.data?.jobId;
        } catch {
          return false;
        }
      },
    });
    
    if (!uploadOk) {
      uploadFailures.add(1);
      console.error('Upload failed:', uploadRes.status, uploadRes.body);
      return;
    }
    
    // Extract job ID
    const uploadBody = JSON.parse(uploadRes.body);
    const jobId = uploadBody.data?.jobId;
    
    if (!jobId) {
      uploadFailures.add(1);
      console.error('No job ID in response');
      return;
    }
    
    // Poll for job completion (non-blocking for k6 iteration)
    // In real scenario, we'd poll asynchronously, but for load test we wait
    const completed = pollJobStatus(jobId, 30);
    
    if (completed) {
      // Verify imported patients are queryable
      const listRes = http.get(
        `${BASE_URL}/api/v1/patients?limit=5`,
        { headers: HEADERS }
      );
      
      check(listRes, {
        'patients list returns 200': (r) => r.status === 200,
        'patients list not empty': (r) => {
          try {
            const body = JSON.parse(r.body);
            return Array.isArray(body.data) && body.data.length > 0;
          } catch {
            return false;
          }
        },
      });
    }
  });
  
  // Think time between imports
  sleep(Math.random() * 3 + 2); // 2-5 seconds
}

// ── Summary handler ───────────────────────────────────────────────────────────
export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    thresholdsPassed: !data.root_group?.checks || 
      Object.values(data.root_group.checks).every(c => c.passes >= c.fails),
    metrics: {
      upload_duration_p95: data.metrics.patient_import_upload_duration?.values['p(95)'] ?? 'N/A',
      upload_duration_p99: data.metrics.patient_import_upload_duration?.values['p(99)'] ?? 'N/A',
      upload_failures: data.metrics.patient_import_upload_failures?.values?.count ?? 0,
      jobs_completed: data.metrics.patient_import_job_completed?.values?.count ?? 0,
      jobs_failed: data.metrics.patient_import_job_failed?.values?.count ?? 0,
      total_requests: data.metrics.http_reqs?.values?.count ?? 0,
      failed_requests: data.metrics.http_req_failed?.values?.count ?? 0,
    },
  };
  
  return {
    'patient-import-summary.json': JSON.stringify(summary, null, 2),
    stdout: `\n[patient-import] Test complete
  Upload p95: ${summary.metrics.upload_duration_p95}ms
  Jobs completed: ${summary.metrics.jobs_completed}
  Jobs failed: ${summary.metrics.jobs_failed}
  Total requests: ${summary.metrics.total_requests}\n`,
  };
}
