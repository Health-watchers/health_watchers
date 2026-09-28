# Mobile App Release Guide

This guide covers the complete process for building, testing, and releasing the Health Watchers mobile app using Expo Application Services (EAS).

## Table of Contents

- [Prerequisites](#prerequisites)
- [Build Profiles](#build-profiles)
- [Local Development](#local-development)
- [Building Previews](#building-previews)
- [Production Releases](#production-releases)
- [OTA Updates](#ota-updates)
- [Store Submission](#store-submission)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Accounts

1. **Expo Account** - Sign up at https://expo.dev
2. **Apple Developer Account** - For iOS builds ($99/year)
3. **Google Play Developer Account** - For Android builds ($25 one-time)

### Required Tools

```bash
# Install Expo CLI globally
npm install -g eas-cli

# Login to Expo
eas login
```

### Required Secrets

Store these in GitHub repository secrets (Settings → Secrets → Actions):

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `EXPO_TOKEN` | Expo authentication token | Run `eas login` then `eas build:configure` |
| `EXPO_APPLE_APP_SPECIFIC_PASSWORD` | Apple App-Specific Password | Apple ID account settings |

### Configure EAS Project

```bash
cd apps/mobile

# Initialize EAS project (one-time)
eas build:configure

# Link to Expo project
eas init
```

## Build Profiles

We have four build profiles configured in `eas.json`:

### 1. Development

**Purpose**: Local development and simulator testing

```bash
eas build --profile development --platform ios
eas build --profile development --platform android
```

- **iOS**: Simulator build, debug configuration
- **Android**: APK with debug symbols
- **Environment**: Local API (localhost:3001), testnet Stellar
- **Distribution**: Internal only

### 2. Preview

**Purpose**: Internal testing and QA

```bash
eas build --profile preview --platform all
```

- **iOS**: Physical device build (TestFlight)
- **Android**: APK for direct installation
- **Environment**: Staging API, testnet Stellar
- **Distribution**: Internal testers
- **Auto-triggered**: On `mobile-v*` tags

### 3. Preview-AAB

**Purpose**: Android App Bundle for Play Store internal testing

```bash
eas build --profile preview-aab --platform android
```

- Same as preview but generates AAB instead of APK
- Required for Play Store uploads

### 4. Production

**Purpose**: Public release to App Store and Play Store

```bash
eas build --profile production --platform all
```

- **iOS**: App Store Connect submission
- **Android**: Google Play Console submission
- **Environment**: Production API, mainnet Stellar
- **Distribution**: Public
- **Trigger**: Manual workflow dispatch only

## Local Development

### Running the App

```bash
cd apps/mobile

# Start Expo dev server
npm run dev

# Run on specific platform
npm run ios      # iOS simulator
npm run android  # Android emulator
npm run web      # Web browser
```

### Testing Builds Locally

```bash
# Install the development build on your device
eas build --profile development --platform ios --local

# Or for Android
eas build --profile development --platform android --local
```

## Building Previews

### Automated Builds (Recommended)

Preview builds are automatically triggered when you push a tag:

```bash
# 1. Update version in app.json
# Edit apps/mobile/app.json, increment "version"

# 2. Commit and tag
git add apps/mobile/app.json
git commit -m "chore(mobile): bump version to 1.1.0"
git tag mobile-v1.1.0
git push origin main --tags

# 3. GitHub Actions will automatically:
#    - Run lint and tests
#    - Build iOS and Android preview
#    - Create a draft GitHub release
```

### Manual Preview Builds

```bash
cd apps/mobile

# Build for both platforms
eas build --profile preview --platform all

# Or build individually
eas build --profile preview --platform ios
eas build --profile preview --platform android

# Check build status
eas build:list
```

### Installing Preview Builds

**iOS (TestFlight):**
1. EAS will submit to TestFlight automatically (if configured)
2. Testers receive notification
3. Install via TestFlight app

**Android:**
1. Download APK from EAS dashboard
2. Send link to testers
3. Install on device (allow unknown sources)

## Production Releases

### Pre-Release Checklist

- [ ] All tests passing
- [ ] Preview build tested by QA team
- [ ] Release notes prepared
- [ ] Version numbers incremented in `app.json`
- [ ] Environment variables verified (production API, mainnet Stellar)
- [ ] App Store/Play Store metadata updated
- [ ] Screenshots updated (if UI changed)

### Building Production Release

Production builds must be triggered manually via GitHub Actions:

1. Go to **Actions** → **Mobile Build & Deploy**
2. Click **Run workflow**
3. Select:
   - Branch: `main`
   - Profile: `production`
   - Platform: `all` (or specific)
4. Click **Run workflow**

Or using EAS CLI:

```bash
cd apps/mobile

# Build for App Store and Play Store
eas build --profile production --platform all

# Monitor build progress
eas build:view
```

### Build Artifacts

Production builds generate:
- **iOS**: `.ipa` file for App Store Connect
- **Android**: `.aab` file for Google Play Console

Download from EAS dashboard: https://expo.dev

## OTA Updates

Over-The-Air (OTA) updates allow you to push JavaScript/React Native changes without going through app store review.

### When to Use OTA

✅ **Good for:**
- Bug fixes
- Copy/text changes
- UI tweaks
- Business logic updates

❌ **Cannot update:**
- Native code changes
- New native dependencies
- Changes to `app.json` config
- Assets bundled with the app

### Publishing OTA Updates

**Automatic** (on push to main):

```bash
# Push to main branch
git push origin main

# GitHub Actions will automatically publish OTA update to preview channel
```

**Manual**:

```bash
cd apps/mobile

# Publish to preview channel
eas update --branch preview --message "Fix: Critical bug in payment flow"

# Publish to production channel
eas update --branch production --message "Fix: Critical security patch"
```

### OTA Update Channels

| Channel | Build Profile | Auto-downloads | Use Case |
|---------|--------------|----------------|----------|
| `development` | development | Yes | Local testing |
| `preview` | preview | Yes | QA testing |
| `production` | production | Yes | Public users |

### Rollback OTA Updates

```bash
# List updates
eas update:list --branch production

# Republish a previous update
eas update:republish --group <group-id>
```

## Store Submission

### iOS App Store

#### Initial Setup (One-Time)

1. Create app in App Store Connect
2. Configure app metadata, screenshots, description
3. Add your Apple ID to `eas.json` submit config:

```json
{
  "submit": {
    "production": {
      "ios": {
        "appleId": "your-email@example.com",
        "ascAppId": "1234567890",
        "appleTeamId": "TEAM123456"
      }
    }
  }
}
```

#### Submission Process

```bash
cd apps/mobile

# Automatic submission after build
eas submit --platform ios --profile production --latest

# Or specify a build ID
eas submit --platform ios --id <build-id>

# Or upload manually to App Store Connect
# Download .ipa from EAS dashboard and use Transporter app
```

#### Post-Submission

1. Go to App Store Connect
2. Complete What's New section
3. Submit for review
4. Wait for Apple review (typically 24-48 hours)
5. Release to App Store once approved

### Android Play Store

#### Initial Setup (One-Time)

1. Create app in Google Play Console
2. Complete store listing (description, screenshots, etc.)
3. Create a service account for EAS:
   - Go to Google Cloud Console
   - Create service account
   - Grant "Service Account User" role
   - Download JSON key
   - Add to `apps/mobile/google-play-service-account.json`
   - Add path to `eas.json`

4. Configure in `eas.json`:

```json
{
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./google-play-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

#### Submission Process

```bash
cd apps/mobile

# Automatic submission after build
eas submit --platform android --profile production --latest

# Or specify a build ID
eas submit --platform android --id <build-id>
```

#### Release Tracks

| Track | Purpose | Rollout |
|-------|---------|---------|
| `internal` | Internal testing | Immediate |
| `alpha` | Closed testing | Small group |
| `beta` | Open testing | Larger audience |
| `production` | Public release | Everyone |

Update track in `eas.json` or via CLI:

```bash
eas submit --platform android --track production
```

#### Post-Submission

1. Go to Play Console → Testing → Internal testing
2. Review and roll out to next track
3. Eventually promote to production

## Troubleshooting

### Build Failures

**Issue**: Build fails during native compilation

```bash
# Check build logs
eas build:view --id <build-id>

# Common fixes:
# - Clear cache and retry
eas build --profile preview --platform ios --clear-cache

# - Check credentials
eas credentials

# - Validate eas.json
cat eas.json | jq .
```

**Issue**: "No valid iOS Distribution certificate found"

```bash
# Regenerate certificates
eas credentials
# Select iOS → Distribution Certificate → Generate new
```

### OTA Update Not Applying

**Symptoms**: Users not seeing the update

**Solutions**:
1. Check update channel matches build profile
2. Verify update was published: `eas update:list`
3. Force check on device: shake device → "Check for updates"
4. Users must restart app for updates to apply

### Submission Rejected

**iOS Common Issues:**
- Missing privacy descriptions in `app.json`
- App crashes on launch (test on real device!)
- Violates App Store guidelines

**Android Common Issues:**
- Missing required permissions declarations
- Improper age rating
- Privacy policy URL missing

### Version Conflicts

**Issue**: "Version already exists in store"

**Solution**: Increment version in `app.json`:

```json
{
  "expo": {
    "version": "1.0.1",  // Increment this
    "ios": {
      "buildNumber": "2"  // Auto-increments with autoIncrement: true
    },
    "android": {
      "versionCode": 2  // Auto-increments with autoIncrement: true
    }
  }
}
```

## Best Practices

### Versioning

Follow semantic versioning (semver):
- **Major** (1.0.0): Breaking changes
- **Minor** (1.1.0): New features, backward compatible
- **Patch** (1.1.1): Bug fixes

### Testing Checklist

Before release:
- [ ] Test on real devices (iOS and Android)
- [ ] Test all critical user flows
- [ ] Test offline functionality
- [ ] Test push notifications
- [ ] Test biometric authentication
- [ ] Verify API connections (staging → production)
- [ ] Check Stellar network (testnet → mainnet)

### Security

- Never commit credentials to git
- Use GitHub Secrets for CI/CD
- Rotate secrets regularly
- Use EAS Secrets for environment variables:

```bash
eas secret:create --name API_KEY --value xxx --type string
```

### Monitoring

Post-release monitoring:
- Check crash reports (Expo dashboard)
- Monitor API error rates
- Watch for sudden increase in uninstalls
- Check store reviews daily

## Useful Commands Reference

```bash
# EAS Authentication
eas login
eas whoami

# Project Setup
eas init
eas build:configure

# Building
eas build --profile preview --platform all
eas build --profile production --platform ios
eas build:list
eas build:view --id <build-id>
eas build:cancel --id <build-id>

# Updates
eas update --branch preview --message "Bug fix"
eas update:list --branch production
eas update:view <update-group-id>

# Submission
eas submit --platform ios --latest
eas submit --platform android --latest

# Credentials
eas credentials
eas credentials:configure-build

# Metadata
eas metadata:pull
eas metadata:push

# Secrets
eas secret:create
eas secret:list
eas secret:delete --name SECRET_NAME
```

## Support & Resources

- **EAS Documentation**: https://docs.expo.dev/eas/
- **Expo Forums**: https://forums.expo.dev/
- **GitHub Issues**: https://github.com/your-org/health-watchers/issues
- **Slack Channel**: #mobile-releases
- **On-Call Mobile Engineer**: See PagerDuty rotation

## Release Schedule

- **Preview Builds**: On-demand (via tags)
- **Production Releases**: Bi-weekly (every other Friday)
- **Hotfixes**: As needed (OTA preferred)
- **Major Releases**: Quarterly

## Changelog

Maintain changelog in `apps/mobile/CHANGELOG.md`:

```markdown
## [1.1.0] - 2024-12-15
### Added
- New payment dispute flow
- Biometric authentication

### Fixed
- Crash on appointment cancellation
- Memory leak in patient list

### Changed
- Updated design of home screen
```
