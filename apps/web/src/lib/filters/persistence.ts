import { type FilterGroup, type SavedFilter, FILTER_STORAGE_KEY, MAX_SAVED_FILTERS } from './types';
import { newId } from './engine';

function readStorage(storage: Storage | null): SavedFilter[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedFilter[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeStorage(storage: Storage | null, filters: SavedFilter[]): void {
  if (!storage) return;
  try {
    storage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters.slice(0, MAX_SAVED_FILTERS)));
  } catch {
    return;
  }
}

function getStorage(scope?: Window | null): Storage | null {
  if (typeof window === 'undefined') return null;
  const target = scope ?? window;
  try {
    return target.localStorage;
  } catch {
    return null;
  }
}

export function listSavedFilters(scope?: Window): SavedFilter[] {
  const storage = getStorage(scope);
  const filters = readStorage(storage);
  return filters.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function saveFilter(name: string, group: FilterGroup, scope?: Window): SavedFilter {
  const storage = getStorage(scope);
  const now = new Date().toISOString();
  const existing = readStorage(storage);
  const record: SavedFilter = {
    id: newId('filter'),
    name,
    group,
    createdAt: now,
    updatedAt: now,
  };
  const updated = [record, ...existing].slice(0, MAX_SAVED_FILTERS);
  writeStorage(storage, updated);
  return record;
}

export function updateSavedFilter(
  id: string,
  name: string,
  group: FilterGroup,
  scope?: Window
): SavedFilter | null {
  const storage = getStorage(scope);
  const existing = readStorage(storage);
  const target = existing.find((saved) => saved.id === id);
  if (!target) return null;
  const updated: SavedFilter = {
    ...target,
    name,
    group,
    updatedAt: new Date().toISOString(),
  };
  writeStorage(
    storage,
    existing.map((saved) => (saved.id === id ? updated : saved))
  );
  return updated;
}

export function deleteSavedFilter(id: string, scope?: Window): boolean {
  const storage = getStorage(scope);
  const existing = readStorage(storage);
  const next = existing.filter((saved) => saved.id !== id);
  if (next.length === existing.length) return false;
  writeStorage(storage, next);
  return true;
}

export function getSavedFilter(id: string, scope?: Window): SavedFilter | undefined {
  return readStorage(getStorage(scope)).find((saved) => saved.id === id);
}
