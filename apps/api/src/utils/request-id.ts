import { Request } from 'express';
import { AsyncLocalStorage } from 'async_hooks';

const requestIdStorage = new AsyncLocalStorage<string>();

export function setRequestId(id: string) {
  requestIdStorage.enterWith(id);
}

export function getRequestId(): string | undefined {
  return requestIdStorage.getStore();
}

export function withRequestId<T>(id: string, fn: () => T): T {
  return requestIdStorage.run(id, fn);
}

export function extractRequestId(req: Request): string {
  return (req as any).id || (req.headers['x-request-id'] as string) || '';
}
