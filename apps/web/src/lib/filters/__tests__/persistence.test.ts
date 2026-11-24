import { createGroup, createRule, addRule } from '../engine';
import { FILTER_STORAGE_KEY } from '../types';
import {
  deleteSavedFilter,
  getSavedFilter,
  listSavedFilters,
  saveFilter,
  updateSavedFilter,
} from '../persistence';

function createPersistenceHarness() {
  const store = new Map<string, string>();
  const mockWindow = {
    localStorage: {
      getItem: (key: string) => {
        const value = store.get(key);
        return value === undefined ? null : value;
      },
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
  } as unknown as Window;
  return { mockWindow, store };
}

function sampleGroup() {
  const rule = createRule('sex', 'equals');
  rule.value = 'F';
  return addRule(createGroup('and'), rule);
}

describe('filter persistence', () => {
  it('saves and reloads a filter from localStorage', () => {
    const { mockWindow } = createPersistenceHarness();
    const saved = saveFilter('Female patients', sampleGroup(), mockWindow);
    expect(saved.name).toBe('Female patients');
    expect(listSavedFilters(mockWindow)).toHaveLength(1);
    expect(getSavedFilter(saved.id, mockWindow)?.group.rules).toHaveLength(1);
  });

  it('returns an empty list when no filters have been saved', () => {
    const { mockWindow } = createPersistenceHarness();
    expect(listSavedFilters(mockWindow)).toEqual([]);
  });

  it('returns null on safe storage when window.localStorage is unavailable', () => {
    expect(listSavedFilters()).toEqual([]);
  });

  it('updates an existing saved filter and bumps updatedAt', () => {
    const { mockWindow } = createPersistenceHarness();
    const saved = saveFilter('A', sampleGroup(), mockWindow);
    const updated = updateSavedFilter(saved.id, 'Better name', sampleGroup(), mockWindow);
    expect(updated?.name).toBe('Better name');
    expect(updated?.updatedAt >= saved.updatedAt).toBe(true);
  });

  it('does not crash when updating a missing filter', () => {
    const { mockWindow } = createPersistenceHarness();
    expect(updateSavedFilter('nope', 'X', sampleGroup(), mockWindow)).toBeNull();
  });

  it('deletes a saved filter', () => {
    const { mockWindow, store } = createPersistenceHarness();
    const saved = saveFilter('Temp', sampleGroup(), mockWindow);
    expect(deleteSavedFilter('missing', mockWindow)).toBe(false);
    expect(deleteSavedFilter(saved.id, mockWindow)).toBe(true);
    expect(listSavedFilters(mockWindow)).toHaveLength(0);
    expect(store.get(FILTER_STORAGE_KEY)).toBe('[]');
  });

  it('deleting a missing filter returns false', () => {
    const { mockWindow } = createPersistenceHarness();
    expect(deleteSavedFilter('does-not-exist', mockWindow)).toBe(false);
  });
});
