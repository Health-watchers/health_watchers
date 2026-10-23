# Health Watchers Mobile App

React Native mobile app for patient portal access, built with Expo.

## Features

- Secure authentication with biometric support
- Offline-first architecture with data caching
- Appointment scheduling and management
- Stellar-based payments
- Health records access (immunizations, documents, care plans)
- Push notifications
- SSL certificate pinning for security

## Development

### Prerequisites

- Node.js 18+
- Expo CLI
- iOS Simulator (Mac) or Android Emulator

### Setup

```bash
npm install

# Start development server
npm run dev

# Run on specific platform
npm run ios      # iOS Simulator
npm run android  # Android Emulator
npm run web      # Web browser
```

### Environment Variables

Create a `.env` file in the `apps/mobile` directory:

```
EXPO_PUBLIC_API_URL=http://localhost:3001/api/v1
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Test Structure

Tests are located alongside source files in `__tests__` directories:

```
src/
├── services/
│   ├── auth.service.ts
│   └── __tests__/
│       └── auth.service.test.ts
├── screens/
│   ├── DashboardScreen.tsx
│   └── __tests__/
│       └── DashboardScreen.test.tsx
```

### Writing Tests

#### Service Tests

Test services using Jest mocks:

```typescript
import { authService } from '../auth.service';
import * as SecureStore from 'expo-secure-store';

jest.mock('expo-secure-store');

describe('AuthService', () => {
  it('stores tokens securely', async () => {
    await authService.login('user@example.com', 'password');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('accessToken', expect.any(String));
  });
});
```

#### Screen Render Tests

Test UI components with React Native Testing Library:

```typescript
import { render, screen } from '@testing-library/react-native';
import { DashboardScreen } from '../DashboardScreen';

describe('DashboardScreen', () => {
  it('renders upcoming appointments', async () => {
    render(<DashboardScreen />);
    expect(await screen.findByText(/Upcoming Appointments/i)).toBeTruthy();
  });
});
```

### Test Coverage

Minimum coverage thresholds:

- Statements: 70%
- Branches: 70%
- Functions: 70%
- Lines: 70%

## Building

### Development Builds

```bash
# Build for iOS
npm run build:ios

# Build for Android
npm run build:android
```

### Production Builds

Production builds are managed through EAS (Expo Application Services):

```bash
# Submit to app stores
npm run submit
```

See `eas.json` for build configuration.

## Architecture

### State Management

- React Query for server state and caching
- Zustand for local UI state

### Security

- SSL certificate pinning via `react-native-ssl-public-key-pinning`
- Jailbreak/root detection via `jail-monkey`
- Biometric authentication via `expo-local-authentication`
- Secure token storage via `expo-secure-store`

### Offline Support

The app uses a multi-layered offline strategy:

1. **React Query Cache**: In-memory cache with 5-minute stale time
2. **AsyncStorage**: Persistent cache for appointments, encounters, and lab results
3. **Fallback Logic**: API errors automatically return cached data

See `src/services/offline-cache.service.ts` for implementation.

### Navigation

Uses React Navigation with:

- Bottom tab navigator for main sections
- Stack navigator for screen hierarchies
- Deep linking support for notifications

## API Integration

All API calls go through the authenticated Axios client in `authService`:

```typescript
import { authService } from './services/auth.service';

const api = authService.getApiClient();
const response = await api.get('/appointments');
```

The client automatically:

- Attaches access tokens to requests
- Refreshes tokens on 401 errors
- Retries failed requests after token refresh

## Troubleshooting

### Common Issues

**Metro bundler cache issues:**

```bash
npx expo start -c
```

**iOS Simulator not showing app:**

```bash
npx expo run:ios
```

**Android build fails:**

```bash
cd android && ./gradlew clean
cd .. && npm run android
```

**Tests fail with Expo module errors:**

Check `jest.setup.js` has all necessary mocks configured.

## Contributing

1. Follow the test patterns in existing test files
2. Maintain test coverage above 70%
3. Test on both iOS and Android before submitting PR
4. Run linter: `npm run lint`
5. Run type check: `npm run typecheck`

## Release Process

See `RELEASE.md` for detailed release instructions.

## Documentation

- [React Native Documentation](https://reactnative.dev/)
- [Expo Documentation](https://docs.expo.dev/)
- [React Navigation](https://reactnavigation.org/)
- [React Query](https://tanstack.com/query/latest)

## License

MIT
