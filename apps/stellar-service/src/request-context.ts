import { AsyncLocalStorage } from 'async_hooks';

type Store = { reqId?: string };

const als = new AsyncLocalStorage<Store>();

export function enterRequestContext(reqId: string) {
  als.enterWith({ reqId });
}

export function getRequestId(): string | undefined {
  return als.getStore()?.reqId;
}

export default als;
