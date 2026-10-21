import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import { themes as prismThemes } from 'prism-react-renderer';

const repoUrl = 'https://github.com/Health-watchers/health_watchers';

const config: Config = {
  title: 'Health Watchers',
  tagline: 'HIPAA-compliant healthcare management platform',
  favicon: 'img/logo.svg',
  // CI sets these so the site works when served from GitHub Pages.
  url: process.env.DOCUSAURUS_URL || 'https://health-watchers.github.io',
  baseUrl: process.env.DOCUSAURUS_BASE_URL || '/',
  organizationName: 'Health-watchers',
  projectName: 'health_watchers',
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'fr'],
    localeConfigs: {
      en: { label: 'English' },
      fr: { label: 'Français' },
    },
  },

  markdown: {
    mermaid: true,
  },
  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: `${repoUrl}/tree/main/apps/docs`,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        docsRouteBasePath: '/',
        indexBlog: false,
        language: ['en', 'fr'],
        highlightSearchTermsOnTargetPage: true,
      },
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'Health Watchers',
      logo: {
        alt: 'Health Watchers Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          type: 'docSidebar',
          sidebarId: 'userGuideSidebar',
          position: 'left',
          label: 'User Guide',
        },
        {
          type: 'localeDropdown',
          position: 'right',
        },
        {
          href: repoUrl,
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Quick Start', to: '/getting-started/quick-start' },
            { label: 'Architecture', to: '/architecture/overview' },
            { label: 'API Reference', to: '/platform/api-reference' },
          ],
        },
        {
          title: 'User Guide',
          items: [
            { label: 'Onboarding a Clinic', to: '/user-guide/onboarding-a-clinic' },
            { label: 'Receiving Payments', to: '/user-guide/stellar-wallet-and-payments' },
          ],
        },
        {
          title: 'Community',
          items: [
            { label: 'GitHub', href: repoUrl },
            { label: 'Contributing', href: `${repoUrl}/blob/main/CONTRIBUTING.md` },
            { label: 'Security', href: `${repoUrl}/blob/main/SECURITY.md` },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Health Watchers. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
