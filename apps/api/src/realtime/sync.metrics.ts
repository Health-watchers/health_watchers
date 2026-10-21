/**
 * Real-time data synchronization — Prometheus metrics
 * Issue #1254
 *
 * Acceptance criterion: "sync propagation < 500ms" — `sync_propagation_seconds`
 * is the histogram used to verify it (originTs -> broadcast).
 */
import client from 'prom-client';
import { register } from '../services/metrics.service';

export const syncChangesTotal = new client.Counter({
  name: 'sync_changes_total',
  help: 'Total sync changes processed, labelled by resolution',
  labelNames: ['resource', 'resolution'] as const,
  registers: [register],
});

export const syncConflictsTotal = new client.Counter({
  name: 'sync_conflicts_total',
  help: 'Total sync conflicts detected, labelled by winner',
  labelNames: ['resource', 'winner'] as const,
  registers: [register],
});

export const syncPropagationSeconds = new client.Histogram({
  name: 'sync_propagation_seconds',
  help: 'Latency from origin-client change timestamp to server broadcast',
  labelNames: ['resource'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1, 2, 5],
  registers: [register],
});

export const syncBatchSize = new client.Histogram({
  name: 'sync_batch_size',
  help: 'Number of changes delivered per outbound batch',
  buckets: [1, 2, 5, 10, 25, 50, 100, 250],
  registers: [register],
});

export const syncReconnectionsTotal = new client.Counter({
  name: 'sync_reconnections_total',
  help: 'Client reconciliation requests after a disconnect',
  labelNames: ['outcome'] as const, // 'delta' | 'resync'
  registers: [register],
});

export const syncActiveClients = new client.Gauge({
  name: 'sync_active_clients',
  help: 'Currently connected sync clients',
  registers: [register],
});
