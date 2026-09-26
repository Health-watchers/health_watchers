/**
 * Unit tests for metrics.service.ts
 */
import {
  normalisePath,
  register,
  httpRequestsTotal,
  patientsCreatedTotal,
  mongodbConnectionPoolSize,
} from './metrics.service';

describe('normalisePath', () => {
  it('replaces MongoDB ObjectIds with :id', () => {
    expect(normalisePath('/api/v1/patients/5f47b2a1c9d3e4f5a6b7c8d9')).toBe('/api/v1/patients/:id');
  });

  it('replaces UUIDs with :uuid', () => {
    expect(normalisePath('/api/v1/x/123e4567-e89b-12d3-a456-426614174000')).toBe('/api/v1/x/:uuid');
  });

  it('replaces plain numbers with :n', () => {
    expect(normalisePath('/api/v1/page/42')).toBe('/api/v1/page/:n');
  });

  it('strips the query string', () => {
    expect(normalisePath('/api/v1/patients?page=1')).toBe('/api/v1/patients');
  });

  it('combines all normalisations', () => {
    expect(normalisePath('/api/v1/patients/5f47b2a1c9d3e4f5a6b7c8d9/appointments/3?limit=10')).toBe(
      '/api/v1/patients/:id/appointments/:n'
    );
  });
});

describe('metrics registration', () => {
  it('exposes a helper that increments http request counters', async () => {
    httpRequestsTotal.inc({ method: 'GET', path: '/health' }, 1);
    const metric = register.getSingleMetric('http_requests_total');
    expect(metric).toBeDefined();
    const value = await metric!.get();
    expect(value.values.some((v) => v.value === 1)).toBe(true);
  });

  it('tracks business counters with labels', async () => {
    patientsCreatedTotal.inc({ clinicId: 'clinic-1' }, 2);
    const metric = register.getSingleMetric('patients_created_total');
    expect(metric).toBeTruthy();
  });

  it('exposes mongo pool gauges', async () => {
    mongodbConnectionPoolSize.set(4);
    const metric = register.getSingleMetric('mongodb_connection_pool_size');
    const value = await metric!.get();
    expect(value.values[0].value).toBe(4);
  });
});
