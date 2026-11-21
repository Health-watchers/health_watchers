import { AsyncLocalStorage } from 'async_hooks';

type Store = { reqId?: string; clinicId?: string; userId?: string };

const als = new AsyncLocalStorage<Store>();

export function enterRequestContext(
  reqId: string,
  context?: { clinicId?: string; userId?: string },
) {
  als.enterWith({ reqId, clinicId: context?.clinicId, userId: context?.userId });
}

export function getRequestId(): string | undefined {
  return als.getStore()?.reqId;
}

export function getClinicId(): string | undefined {
  return als.getStore()?.clinicId;
}

export function getUserId(): string | undefined {
  return als.getStore()?.userId;
}

export function getRequestContext(): Store | undefined {
  return als.getStore();
}

export default als;