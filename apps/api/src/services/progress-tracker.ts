import { Response } from 'express';
import { getJobProgress, BatchProgress } from '@api/services/batch-queue';

interface ProgressEvent {
  jobId: string;
  type: 'progress' | 'completed' | 'failed';
  data: BatchProgress;
  timestamp: number;
}

class ProgressTracker {
  private clients: Map<string, Set<Response>> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  subscribe(jobId: string, res: Response): void {
    if (!this.clients.has(jobId)) {
      this.clients.set(jobId, new Set());
    }
    this.clients.get(jobId)!.add(res);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    res.write('data: {"type":"connected"}\n\n');

    if (!this.intervals.has(jobId)) {
      const interval = setInterval(() => {
        this.broadcastProgress(jobId);
      }, 1000);
      this.intervals.set(jobId, interval);
    }

    res.on('close', () => {
      this.unsubscribe(jobId, res);
    });
  }

  unsubscribe(jobId: string, res: Response): void {
    const clients = this.clients.get(jobId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        this.clients.delete(jobId);
        const interval = this.intervals.get(jobId);
        if (interval) {
          clearInterval(interval);
          this.intervals.delete(jobId);
        }
      }
    }
  }

  broadcastProgress(jobId: string): void {
    const progress = getJobProgress(jobId);
    if (!progress) return;

    const clients = this.clients.get(jobId);
    if (!clients || clients.size === 0) return;

    const event: ProgressEvent = {
      jobId,
      type: progress.status === 'completed' ? 'completed' : progress.status === 'failed' ? 'failed' : 'progress',
      data: progress,
      timestamp: Date.now(),
    };

    const message = `data: ${JSON.stringify(event)}\n\n`;

    for (const client of clients) {
      try {
        client.write(message);
      } catch (error) {
        this.unsubscribe(jobId, client);
      }
    }

    if (progress.status === 'completed' || progress.status === 'failed') {
      setTimeout(() => {
        this.cleanup(jobId);
      }, 5000);
    }
  }

  private cleanup(jobId: string): void {
    const clients = this.clients.get(jobId);
    if (clients) {
      for (const client of clients) {
        client.end();
      }
    }
    this.clients.delete(jobId);

    const interval = this.intervals.get(jobId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(jobId);
    }
  }
}

export const progressTracker = new ProgressTracker();

export function streamProgress(jobId: string, res: Response): void {
  progressTracker.subscribe(jobId, res);
}
