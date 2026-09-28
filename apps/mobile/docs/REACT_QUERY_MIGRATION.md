# React Query v3 → TanStack React Query v5 Migration Guide

## Summary
Mobile app has been upgraded from `react-query@3.39.0` to `@tanstack/react-query@5.0.0` to align with web app and benefit from improved TypeScript support and React Native optimizations.

## Key Changes

### 1. Package Changes
```diff
- "react-query": "^3.39.0",
+ "@tanstack/react-query": "^5.0.0",
```

### 2. Import Changes
```diff
// Old (v3)
- import { useQuery, useMutation } from 'react-query';

// New (v5)
+ import { useQuery, useMutation } from '@tanstack/react-query';
```

### 3. useQuery API Changes
```diff
// Old (v3)
- const { data } = useQuery('patients', fetchPatients);

// New (v5)
+ const { data } = useQuery({
+   queryKey: ['patients'],
+   queryFn: fetchPatients,
+ });
```

### 4. Query Keys Migration
Query keys should be centralized in `packages/types` or a new `packages/api-client` module to share conventions across web and mobile:

```typescript
// packages/api-client/src/query-keys.ts
export const patientKeys = {
  all: ['patients'] as const,
  lists: () => [...patientKeys.all, 'list'] as const,
  detail: (id: string) => [...patientKeys.all, 'detail', id] as const,
};

// Usage in mobile
import { patientKeys } from '@health-watchers/api-client';

const { data } = useQuery({
  queryKey: patientKeys.detail(patientId),
  queryFn: () => fetchPatient(patientId),
});
```

### 5. React Native Configuration
The QueryClient must be configured for React Native's unique lifecycle and offline behavior:

```typescript
// apps/mobile/src/api/query-client.ts
import {
  QueryClient,
  focusManager,
  onlineManager,
} from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

// Enable/disable queries based on network status
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(state.isConnected ?? false);
  });
});

// Resume queries on app foreground, pause on background
const subscription = AppState.addEventListener('change', (status) => {
  focusManager.setFocused(status === 'active');
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

export default queryClient;
```

### 6. useMutation Changes
```diff
// Old (v3)
- const mutation = useMutation(createAppointment, {
-   onSuccess: (data) => { /* ... */ },
- });

// New (v5)
+ const mutation = useMutation({
+   mutationFn: createAppointment,
+   onSuccess: (data) => { /* ... */ },
+ });
```

### 7. useInfiniteQuery Changes
```diff
// Old (v3)
- const { data } = useInfiniteQuery(
-   'appointments',
-   ({ pageParam = 0 }) => fetchAppointments(pageParam),
-   {
-     getNextPageParam: (lastPage) => lastPage.nextCursor,
-   }
- );

// New (v5)
+ const { data } = useInfiniteQuery({
+   queryKey: ['appointments'],
+   queryFn: ({ pageParam = 0 }) => fetchAppointments(pageParam),
+   getNextPageParam: (lastPage) => lastPage.nextCursor,
+ });
```

## Migration Checklist

- [ ] Update package.json with `@tanstack/react-query@5.0.0`
- [ ] Run `npm install`
- [ ] Update all imports from `react-query` to `@tanstack/react-query`
- [ ] Migrate useQuery calls to new API with explicit `queryKey` and `queryFn`
- [ ] Migrate useMutation calls to new API
- [ ] Create shared query keys module in packages/api-client or packages/types
- [ ] Configure QueryClient for React Native (network detection, app state)
- [ ] Test offline/online transitions
- [ ] Test app foreground/background transitions
- [ ] Run `npm run typecheck --workspace=mobile`
- [ ] Run `npm run test --workspace=mobile`

## References
- [TanStack Query v5 Migration Guide](https://tanstack.com/query/latest/docs/react/overview)
- [TanStack Query React Native Guide](https://tanstack.com/query/latest/docs/react/guides/important-defaults)
