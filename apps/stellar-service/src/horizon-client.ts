import { Horizon } from '@stellar/stellar-sdk';
import logger from './logger.js';
import { register } from './metrics.js';
import client from 'prom-client';

// ── Prometheus metrics ────────────────────────────────────────────────────────

export const horizonEndpointHealth = new client.Gauge({
  name: 'horizon_endpoint_healthy',
  help: 'Whether a Horizon endpoint is healthy (1=healthy, 0=unhealthy)',
  labelNames: ['url'] as const,
  registers: [register],
});

export const horizonEndpointLatency = new client.Histogram({
  name: 'horizon_endpoint_latency_seconds',
  help: 'Horizon endpoint response latency in seconds',
  labelNames: ['url'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const horizonFailoversTotal = new client.Counter({
  name: 'horizon_failovers_total',
  help: 'Total number of Horizon endpoint failovers',
  labelNames: ['from', 'to'] as const,
  registers: [register],
});

export const horizonCircuitBreakerState = new client.Gauge({
  name: 'horizon_circuit_breaker_open',
  help: 'Whether the circuit breaker for a Horizon endpoint is open (1=open, 0=closed)',
  labelNames: ['url'] as const,
  registers: [register],
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface HorizonEndpoint {
  url: string;
  healthy: boolean;
  lastChecked: number;
  latency: number;
  weight: number;
  // Circuit breaker state
  consecutiveFailures: number;
  circuitOpen: boolean;
  circuitOpenedAt: number;
}

const CIRCUIT_BREAKER_THRESHOLD = 5;       // open after N consecutive failures
const CIRCUIT_BREAKER_RESET_MS   = 60_000; // try again after 60 s
const SLOW_RESPONSE_THRESHOLD_MS = 5_000;  // treat as failure if > 5 s
const HEALTH_CHECK_INTERVAL_MS   = 30_000;
const HEALTH_CHECK_TIMEOUT_MS    = 5_000;

// ── ResilientHorizonClient ────────────────────────────────────────────────────

class ResilientHorizonClient {
  private endpoints: HorizonEndpoint[];
  private currentIndex: number = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(horizonUrls: string[]) {
    this.endpoints = horizonUrls.map((url, i) => ({
      url,
      healthy: true,
      lastChecked: 0,
      latency: 0,
      weight: horizonUrls.length - i, // primary gets highest weight
      consecutiveFailures: 0,
      circuitOpen: false,
      circuitOpenedAt: 0,
    }));
  }

  // ── Circuit breaker helpers ─────────────────────────────────────────────────

  private isCircuitOpen(ep: HorizonEndpoint): boolean {
    if (!ep.circuitOpen) return false;
    // Half-open: allow a probe after reset window
    if (Date.now() - ep.circuitOpenedAt >= CIRCUIT_BREAKER_RESET_MS) {
      ep.circuitOpen = false;
      ep.consecutiveFailures = 0;
      horizonCircuitBreakerState.set({ url: ep.url }, 0);
      logger.info({ url: ep.url }, 'Horizon circuit breaker half-open — probing');
      return false;
    }
    return true;
  }

  private recordSuccess(ep: HorizonEndpoint, latencyMs: number): void {
    ep.healthy = true;
    ep.latency = latencyMs;
    ep.lastChecked = Date.now();
    ep.consecutiveFailures = 0;
    ep.circuitOpen = false;
    horizonEndpointHealth.set({ url: ep.url }, 1);
    horizonEndpointLatency.observe({ url: ep.url }, latencyMs / 1000);
    horizonCircuitBreakerState.set({ url: ep.url }, 0);
  }

  private recordFailure(ep: HorizonEndpoint, latencyMs: number): void {
    ep.healthy = false;
    ep.latency = latencyMs;
    ep.lastChecked = Date.now();
    ep.consecutiveFailures += 1;
    horizonEndpointHealth.set({ url: ep.url }, 0);

    if (ep.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD && !ep.circuitOpen) {
      ep.circuitOpen = true;
      ep.circuitOpenedAt = Date.now();
      horizonCircuitBreakerState.set({ url: ep.url }, 1);
      logger.warn(
        { url: ep.url, failures: ep.consecutiveFailures },
        'Horizon circuit breaker opened'
      );
    }
  }

  // ── Health check ────────────────────────────────────────────────────────────

  private async checkEndpointHealth(ep: HorizonEndpoint): Promise<void> {
    if (this.isCircuitOpen(ep)) return;

    const start = Date.now();
    try {
      const server = new Horizon.Server(ep.url);
      await Promise.race([
        server.feeStats(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), HEALTH_CHECK_TIMEOUT_MS)
        ),
      ]);

      const latency = Date.now() - start;
      if (latency > SLOW_RESPONSE_THRESHOLD_MS) {
        this.recordFailure(ep, latency);
        logger.warn({ url: ep.url, latency }, 'Horizon endpoint too slow — treating as failure');
      } else {
        this.recordSuccess(ep, latency);
        logger.info({ url: ep.url, latency }, 'Horizon endpoint healthy');
      }
    } catch (error) {
      this.recordFailure(ep, Date.now() - start);
      logger.warn({ url: ep.url, error: (error as Error).message }, 'Horizon endpoint unhealthy');
    }
  }

  private async runHealthChecks(): Promise<void> {
    await Promise.all(this.endpoints.map(ep => this.checkEndpointHealth(ep)));

    if (!this.isEndpointUsable(this.endpoints[this.currentIndex])) {
      const next = this.selectEndpoint();
      this.switchEndpoint(next);
    }
  }

  // ── Endpoint selection (weighted round-robin among healthy endpoints) ────────

  private isEndpointUsable(ep: HorizonEndpoint): boolean {
    return ep.healthy && !this.isCircuitOpen(ep);
  }

  /**
   * Weighted selection: pick a random healthy endpoint weighted by `weight`.
   * Falls back to lowest-latency endpoint if none are healthy.
   */
  private selectEndpoint(): number {
    const usable = this.endpoints
      .map((ep, idx) => ({ ep, idx }))
      .filter(({ ep }) => this.isEndpointUsable(ep));

    if (usable.length === 0) {
      // All unhealthy — pick lowest latency
      let best = 0;
      for (let i = 1; i < this.endpoints.length; i++) {
        if (this.endpoints[i].latency < this.endpoints[best].latency) best = i;
      }
      return best;
    }

    const totalWeight = usable.reduce((s, { ep }) => s + ep.weight, 0);
    let rand = Math.random() * totalWeight;
    for (const { ep, idx } of usable) {
      rand -= ep.weight;
      if (rand <= 0) return idx;
    }
    return usable[usable.length - 1].idx;
  }

  private switchEndpoint(newIndex: number): void {
    if (newIndex === this.currentIndex) return;
    const from = this.endpoints[this.currentIndex].url;
    const to   = this.endpoints[newIndex].url;
    logger.info({ from, to }, 'Switching Horizon endpoint');
    horizonFailoversTotal.inc({ from, to });
    this.currentIndex = newIndex;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  getServer(): Horizon.Server {
    return new Horizon.Server(this.endpoints[this.currentIndex].url);
  }

  getCurrentEndpoint(): HorizonEndpoint {
    return this.endpoints[this.currentIndex];
  }

  getEndpointsStatus(): HorizonEndpoint[] {
    return this.endpoints;
  }

  startHealthChecks(): void {
    if (this.healthCheckInterval) return;
    logger.info('Starting Horizon health checks');
    this.runHealthChecks();
    this.healthCheckInterval = setInterval(
      () => this.runHealthChecks(),
      HEALTH_CHECK_INTERVAL_MS
    );
  }

  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('Stopped Horizon health checks');
    }
  }

  async getNetworkStatus(): Promise<{
    currentEndpoint: string;
    latency: number;
    endpoints: Array<{ url: string; healthy: boolean; latency: number; circuitOpen: boolean; consecutiveFailures: number }>;
    stellarStatus: { status: string; incidents: number } | null;
  }> {
    const current = this.getCurrentEndpoint();
    let stellarStatus = null;

    try {
      const response = await fetch('https://status.stellar.org/api/v2/status.json', {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = (await response.json()) as any;
        stellarStatus = {
          status: data.status?.indicator || 'unknown',
          incidents: data.incidents?.length || 0,
        };
      }
    } catch (error) {
      logger.warn({ error: (error as Error).message }, 'Failed to fetch Stellar status');
    }

    return {
      currentEndpoint: current.url,
      latency: current.latency,
      endpoints: this.endpoints.map(ep => ({
        url: ep.url,
        healthy: ep.healthy,
        latency: ep.latency,
        circuitOpen: ep.circuitOpen,
        consecutiveFailures: ep.consecutiveFailures,
      })),
      stellarStatus,
    };
  }
}

export default ResilientHorizonClient;
