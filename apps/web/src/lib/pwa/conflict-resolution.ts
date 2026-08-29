export interface ConflictData {
  id: string;
  local: any;
  remote: any;
  timestamp: number;
  resolved?: boolean;
}

export type ConflictStrategy = 'local' | 'remote' | 'merge' | 'manual';

export async function detectConflict(
  localData: any,
  remoteData: any
): Promise<boolean> {
  if (JSON.stringify(localData) === JSON.stringify(remoteData)) {
    return false;
  }

  return true;
}

export function resolveConflict(
  conflict: ConflictData,
  strategy: ConflictStrategy
): any {
  switch (strategy) {
    case 'local':
      return conflict.local;
    case 'remote':
      return conflict.remote;
    case 'merge':
      return mergeObjects(conflict.local, conflict.remote);
    case 'manual':
      return null;
    default:
      return conflict.remote;
  }
}

function mergeObjects(local: any, remote: any): any {
  if (typeof local !== 'object' || typeof remote !== 'object') {
    return remote;
  }

  if (Array.isArray(local) || Array.isArray(remote)) {
    return remote;
  }

  const merged = { ...remote };
  for (const key in local) {
    if (key in remote) {
      if (typeof local[key] === 'object' && typeof remote[key] === 'object') {
        merged[key] = mergeObjects(local[key], remote[key]);
      } else if (local[key] !== remote[key]) {
        merged[key] = remote[key];
      }
    } else {
      merged[key] = local[key];
    }
  }

  return merged;
}

export async function storeConflict(conflict: ConflictData): Promise<void> {
  const conflicts = JSON.parse(localStorage.getItem('_conflicts') || '[]');
  conflicts.push(conflict);
  localStorage.setItem('_conflicts', JSON.stringify(conflicts));
}

export async function getConflicts(): Promise<ConflictData[]> {
  const conflicts = JSON.parse(localStorage.getItem('_conflicts') || '[]');
  return conflicts.filter((c: ConflictData) => !c.resolved);
}

export async function resolveConflictManual(
  conflictId: string,
  resolvedData: any
): Promise<void> {
  const conflicts = JSON.parse(localStorage.getItem('_conflicts') || '[]');
  const index = conflicts.findIndex((c: ConflictData) => c.id === conflictId);
  if (index >= 0) {
    conflicts[index].resolved = true;
    conflicts[index].local = resolvedData;
  }
  localStorage.setItem('_conflicts', JSON.stringify(conflicts));
}
