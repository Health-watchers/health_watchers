# Health Watchers Mobile App

React Native patient portal mobile application built with Expo for iOS and Android.

## Features

- **Authentication**: Email/password login with biometric support (Face ID, Touch ID)
- **Dashboard**: View upcoming appointments and recent encounters
- **Appointments**: Manage and view appointment details
- **Health Records**: Access encounters and lab results
- **Payments**: View invoices and pay via Stellar wallet deep links
- **Push Notifications**: Appointment reminders, payment confirmations, lab results
- **Offline Support**: Cache recent data for offline access

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- Expo CLI: `npm install -g expo-cli`
- iOS: Xcode (for iOS development)
- Android: Android Studio (for Android development)

### Installation

```bash
npm install
```

### Development

```bash
# Start Expo development server
npm run dev

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android

# Run on web
npm run web
```

### Building

```bash
# Build for iOS
npm run build:ios

# Build for Android
npm run build:android

# Build both platforms
npm run build
```

## Architecture

### Services

- **AuthService**: Handles authentication, token refresh, and API client setup
- **NotificationService**: Manages push notifications and deep linking
- **OfflineCacheService**: Caches appointments, encounters, and lab results

### Screens

- **DashboardScreen**: Shows upcoming appointments and recent encounters
- **PaymentScreen**: Displays invoices and Stellar wallet payment options

### State Management

- React Query for server state management
- Zustand for local state (if needed)

## Environment Variables

Create `.env` file:

```
EXPO_PUBLIC_API_URL=http://localhost:3001/api/v1
```

## Security

- Credentials stored in Expo Secure Store
- Biometric authentication support
- JWT token refresh on 401 responses
- HTTPS enforced in production

## Stellar Integration

The app supports deep linking to Stellar wallets:

- **Lobstr**: `stellar:pay?destination=...&amount=...`
- **Solar**: `solar:pay?destination=...&amount=...`

## Testing

```bash
npm run test
```

## Linting

```bash
npm run lint
npm run typecheck
```
