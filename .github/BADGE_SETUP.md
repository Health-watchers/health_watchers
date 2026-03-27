# Badge Setup Guide

This guide helps you configure the badges in README.md to display correctly.

## 1. CI Status Badge

The CI badge will automatically work once you:
1. Push the `.github/workflows/ci.yml` file to your repository
2. Replace `OWNER` in README.md with your GitHub username/org
3. The badge will show green when CI passes

## 2. Code Coverage Badge (Codecov)

1. Sign up at https://codecov.io with your GitHub account
2. Add your repository to Codecov
3. Get your upload token from Codecov dashboard
4. Add `CODECOV_TOKEN` to GitHub Secrets:
   - Go to Settings > Secrets and variables > Actions
   - Click "New repository secret"
   - Name: `CODECOV_TOKEN`
   - Value: Your token from Codecov
5. Replace `OWNER` in the codecov badge URL with your GitHub username/org

## 3. License Badge

Already configured! The MIT license badge will work automatically once you push the LICENSE file.

## 4. Node Version Badge

Already configured! Shows Node.js >= 18.0.0 requirement.

## 5. npm Version Badge

Already configured! Shows npm 10.9.2 as specified in package.json.

## Optional: Additional Badges

### Snyk Security Badge
1. Sign up at https://snyk.io
2. Add your repository
3. Add `SNYK_TOKEN` to GitHub Secrets
4. Add badge: `[![Known Vulnerabilities](https://snyk.io/test/github/OWNER/health-watchers/badge.svg)](https://snyk.io/test/github/OWNER/health-watchers)`

### Dependencies Badge
Add: `[![Dependencies](https://img.shields.io/librariesio/github/OWNER/health-watchers)](https://libraries.io/github/OWNER/health-watchers)`

## Testing Your Badges

After setup, badges should display:
- ✅ Green CI badge when tests pass
- ✅ Coverage percentage from Codecov
- ✅ MIT License badge
- ✅ Node version requirement
- ✅ npm version

Replace all instances of `OWNER` with your actual GitHub username or organization name!
