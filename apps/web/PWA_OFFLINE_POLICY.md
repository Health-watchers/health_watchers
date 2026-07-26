# PWA Offline Support & Data Policy

## Overview

Health Watchers implements Progressive Web App (PWA) offline support to ensure clinicians can access critical patient data even when internet connectivity is unavailable. This document outlines the caching strategy, data retention policy, and security considerations.

## Caching Strategies

### 1. Static Assets (Cache First)
- **Strategy**: Cache first, fallback to network
- **TTL**: Indefinite (until app update)
- **Includes**: CSS, JavaScript, fonts, images
- **Purpose**: Fast load times and offline availability

### 2. Clinical Data (Stale-While-Revalidate)
- **Strategy**: Return cached data immediately, update in background
- **TTL**: 24 hours
- **Endpoints**:
  - `/api/v1/patients` - Patient list and basic info
  - `/api/v1/encounters` - Recent encounters
- **Purpose**: Ensure clinicians can view recently accessed patient records offline
- **Security**: Non-sensitive data only (names, IDs, basic demographics)

### 3. API Requests (Network First)
- **Strategy**: Try network first, fallback to cache if available
- **TTL**: 1 hour
- **Includes**: All other API endpoints
- **Purpose**: Ensure data freshness while providing offline fallback

## Data Retention

| Data Type | Cached | TTL | Reason |
|-----------|--------|-----|--------|
| Static assets | Yes | Indefinite | App functionality |
| Patient list | Yes | 24h | Clinical access |
| Encounters | Yes | 24h | Clinical access |
| Medical records | No | N/A | PHI protection |
| Lab results | No | N/A | PHI protection |
| Medications | No | N/A | PHI protection |
| Allergies | No | N/A | PHI protection |

## Security Considerations

### PHI (Protected Health Information)
- **Sensitive data is NOT cached** in the service worker
- Medical records, lab results, medications, and allergies are excluded
- Users must explicitly opt-in to cache sensitive data (future feature)
- All cached data is stored locally on the device

### Offline Form Submissions
- Form submissions made while offline are queued in IndexedDB
- Queued forms are synced when connectivity is restored
- Users receive confirmation when forms are successfully synced
- Failed submissions are retained for manual retry

### Cache Invalidation
- Caches are automatically cleared on app updates
- Users can manually clear cache via browser settings
- Sensitive data caches are cleared on logout

## User Experience

### Offline Indicator
- Yellow banner appears at bottom of screen when offline
- Indicates which data is available offline
- Disappears automatically when connectivity is restored

### Form Submission
- Forms can be submitted while offline
- Submission is queued and synced automatically
- User receives feedback on sync status
- Failed submissions can be retried manually

### Data Freshness
- Clinical data uses stale-while-revalidate strategy
- Users see cached data immediately
- App fetches fresh data in background
- Users are notified if data has changed

## Implementation Details

### Service Worker
- Located at `/public/sw.js`
- Implements three caching strategies
- Handles background sync for form submissions
- Communicates with client via postMessage API

### Offline Sync Utility
- Located at `/src/lib/offline-sync.ts`
- Provides `OfflineSync` class for form storage
- Provides `useOnlineStatus` hook for monitoring connectivity
- Provides `useServiceWorkerMessage` hook for listening to sync events

### Offline Indicator Component
- Located at `/src/components/offline-indicator.tsx`
- Displays when `navigator.onLine === false`
- Shows helpful message about offline capabilities
- Auto-hides when connectivity is restored

## Testing

### Playwright Tests
- Located at `/e2e/offline.spec.ts`
- Tests offline indicator visibility
- Tests patient list caching
- Tests form submission queueing
- Tests stale-while-revalidate behavior
- Tests PHI protection (no caching)

### Manual Testing
1. Open DevTools → Network tab
2. Check "Offline" checkbox
3. Verify offline indicator appears
4. Verify patient list is still accessible
5. Try submitting a form
6. Uncheck "Offline" checkbox
7. Verify form is synced and offline indicator disappears

## Future Enhancements

1. **Selective PHI Caching**: Allow users to explicitly cache sensitive data for offline access
2. **Sync Status Dashboard**: Show pending form submissions and sync history
3. **Conflict Resolution**: Handle conflicts when offline changes conflict with server updates
4. **Bandwidth Optimization**: Implement delta sync to reduce data transfer
5. **Encryption**: Encrypt cached PHI data at rest

## Compliance

- **HIPAA**: Offline caching respects HIPAA requirements by not caching PHI by default
- **GDPR**: Users can clear cache via browser settings; data is not shared with third parties
- **Accessibility**: Offline indicator is keyboard accessible and screen reader friendly

## References

- [MDN: Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [MDN: Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache)
- [MDN: Background Sync API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Sync_API)
- [Web.dev: Offline Cookbook](https://jakearchibald.com/2014/offline-cookbook/)
