const createNextIntlPlugin = require("next-intl/plugin");

const withNextIntl = createNextIntlPlugin("./i18n.ts");

/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  transpilePackages: ["@health-watchers/types"],
  experimental: { missingSuspenseWithCSRBailout: false },
};

// Disable Next.js lockfile patching (causes false yarn errors in npm monorepos)
process.env.NEXT_DISABLE_LOCKFILE_PATCHING = '1';

module.exports = withNextIntl(nextConfig);
