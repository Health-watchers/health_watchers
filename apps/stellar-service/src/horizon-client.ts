import { Horizon } from '@stellar/stellar-sdk';
import logger from './logger.js';

interface HorizonEndpoint {
  url: string;
  healthy: boolean;
  lastChecked: number;
  latency: number;
}

class ResilientHorizonClient {
  private endpoints: HorizonEndpoint[];
  private currentIndex: number = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds

  constructor(horizonUrls: string[]) {
    this.endpoints = horizonUrls.map(url => ({
      url,
      healthy: true,
      lastChecked: 0,
      latency: 0,
    }));
  }

  /**
   * Get the current healthy Horizon server instance
   */
  getServer(): Horizon.Server {
    const endpoint = this.endpoints[this.currentIndex];
    return new Horizon.Server(endpoint.url);
  }

  /**
   * Get current endpoint info
   */
  getCurrentEndpoint(): HorizonEndpoint {
    return this.endpoints[this.currentIndex];
  }

  /**
   * Get all endpoints status
   */
  getEndpointsStatus(): HorizonEndpoint[] {
    return this.endpoints;
  }

  /**
   * Check health of a specific endpoint
   */
  private async checkEndpointHealth(endpoint: HorizonEndpoint): Promise<void> {
    const start = Date.now();
    try {
      const server = new Horizon.Server(endpoint.url);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.HEALTH_CHECK_TIMEOUT);

      await Promise.race([
        server.feeStats(),
        new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(new Error('Timeout')));
        }),
      ]);

      clearTimeout(timeout);
      endpoint.healthy = true;
      endpoint.latency = Date.now() - start;
      endpoint.lastChecked = Date.now();

      logger.info({ url: endpoint.url, latency: endpoint.latency }, 'Horizon endpoint healthy');
    } catch (error) {
      endpoint.healthy = false;
      endpoint.latency = Date.now() - start;
      endpoint.lastChecked = Date.now();

      logger.warn({ url: endpoint.url, error: (error as Error).message }, 'Horizon endpoint unhealthy');
    }
  }

  /**
   * Find the next healthy endpoint
   */
  private findHealthyEndpoint(): number {
    // First, try to find a healthy endpoint starting from current + 1
    for (let i = 1; i < this.endpoints.length; i++) {
      const idx = (this.currentIndex + i) % this.endpoints.length;
      if (this.endpoints[idx].healthy) {
        return idx;
      }
    }

    // If no healthy endpoint, return the one with lowest latency
    let bestIdx = 0;
    let bestLatency = this.endpoints[0].latency;
    for (let i = 1; i < this.endpoints.length; i++) {
      if (this.endpoints[i].latency < bestLatency) {
        bestLatency = this.endpoints[i].latency;
        bestIdx = i;
      }
    }

    return bestIdx;
  }

  /**
   * Switch to a different endpoint
   */
  private switchEndpoint(newIndex: number): void {
    if (newIndex !== this.currentIndex) {
      const oldEndpoint = this.endpoints[this.currentIndex];
      const newEndpoint = this.endpoints[newIndex];

      logger.info(
        { from: oldEndpoint.url, to: newEndpoint.url, reason: 'failover' },
        'Switching Horizon endpoint'
      );

      this.currentIndex = newIndex;
    }
  }

  /**
   * Start background health checks
   */
  startHealthChecks(): void {
    if (this.healthCheckInterval) {
      return; // Already running
    }

    logger.info('Starting Horizon health checks');

    // Run initial check immediately
    this.runHealthChecks();

    // Then run periodically
    this.healthCheckInterval = setInterval(() => {
      this.runHealthChecks();
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Run health checks on all endpoints
   */
  private async runHealthChecks(): Promise<void> {
    const checks = this.endpoints.map(endpoint => this.checkEndpointHealth(endpoint));
    await Promise.all(checks);

    // Switch to healthy endpoint if current is unhealthy
    if (!this.endpoints[this.currentIndex].healthy) {
      const healthyIdx = this.findHealthyEndpoint();
      this.switchEndpoint(healthyIdx);
    }
  }

  /**
   * Stop background health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('Stopped Horizon health checks');
    }
  }

  /**
   * Get network status including Stellar status page
   */
  async getNetworkStatus(): Promise<{
    currentEndpoint: string;
    latency: number;
    endpoints: Array<{ url: string; healthy: boolean; latency: number }>;
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
      })),
      stellarStatus,
    };
  }
}

export default ResilientHorizonClient;
