/**
 * Pseudo-locale visual pass (en-XA).
 *
 * For each key page this spec:
 *   1. Saves a full-page screenshot to pseudo-locale-report/screenshots/.
 *   2. Fails if the page scrolls horizontally (obvious overflow).
 *   3. Flags visible text that is still plain ASCII — pseudo-localised strings
 *      are fully accented, so these are literals that bypass next-intl.
 *
 * Untranslated literals are reported (annotation + findings.json) rather than
 * failing the run, since user data such as patient names is also plain ASCII.
 */

import fs from 'fs';
import path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { disableAnimations, loginAs, waitForPageStable } from '../visual/helpers';

const PSEUDO_LOCALE = 'en-XA';
const REPORT_DIR = path.resolve(__dirname, '../../pseudo-locale-report');
const FINDINGS_FILE = path.join(REPORT_DIR, 'findings.json');

const PUBLIC_PAGES = [
  { name: 'login', path: '/login' },
  { name: 'register', path: '/register' },
  { name: 'forgot-password', path: '/forgot-password' },
];

const AUTHENTICATED_PAGES = [
  { name: 'dashboard', path: '/' },
  { name: 'patients-list', path: '/patients' },
  { name: 'patients-new', path: '/patients/new' },
  { name: 'appointments', path: '/appointments' },
  { name: 'encounters-list', path: '/encounters' },
  { name: 'encounters-new', path: '/encounters/new' },
  { name: 'payments', path: '/payments' },
  { name: 'settings', path: '/settings' },
];

interface PageFindings {
  page: string;
  project: string;
  untranslated: string[];
  horizontalOverflowPx: number;
}

async function usePseudoLocale(page: Page): Promise<void> {
  const baseURL = test.info().project.use.baseURL ?? 'http://localhost:3000';
  await page.context().addCookies([{ name: 'locale', value: PSEUDO_LOCALE, url: baseURL }]);
}

/** Visible text nodes that still contain unaccented words (2+ ASCII letters). */
async function findUntranslatedLiterals(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const ignored = 'script, style, noscript, code, pre, time, input, textarea, [data-i18n-ignore]';
    const found = new Set<string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim() ?? '';
      const parent = node.parentElement;
      if (!text || !parent || parent.closest(ignored)) continue;
      if (!parent.checkVisibility()) continue;
      if (/[A-Za-z]{2,}/.test(text)) found.add(text.slice(0, 120));
    }
    return [...found];
  });
}

async function measureHorizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

async function capture(page: Page, name: string): Promise<void> {
  const project = test.info().project.name;
  await waitForPageStable(page);
  await disableAnimations(page);

  expect(await page.locator('html').getAttribute('lang')).toBe(PSEUDO_LOCALE);

  const screenshotPath = path.join(REPORT_DIR, 'screenshots', project, `${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await test.info().attach(`${name}.png`, { path: screenshotPath, contentType: 'image/png' });

  const findings: PageFindings = {
    page: name,
    project,
    untranslated: await findUntranslatedLiterals(page),
    horizontalOverflowPx: await measureHorizontalOverflow(page),
  };
  recordFindings(findings);

  if (findings.untranslated.length > 0) {
    test.info().annotations.push({
      type: 'untranslated',
      description: `${findings.untranslated.length} literal(s): ${findings.untranslated.slice(0, 10).join(' | ')}`,
    });
  }

  expect(findings.horizontalOverflowPx, `${name} overflows horizontally`).toBeLessThanOrEqual(0);
}

function recordFindings(findings: PageFindings): void {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const existing: PageFindings[] = fs.existsSync(FINDINGS_FILE)
    ? JSON.parse(fs.readFileSync(FINDINGS_FILE, 'utf8'))
    : [];
  const merged = existing.filter((f) => f.page !== findings.page || f.project !== findings.project);
  merged.push(findings);
  fs.writeFileSync(FINDINGS_FILE, `${JSON.stringify(merged, null, 2)}\n`);
}

test.describe('Pseudo-locale — public pages', () => {
  test.beforeEach(async ({ page }) => {
    await usePseudoLocale(page);
  });

  for (const { name, path: route } of PUBLIC_PAGES) {
    test(name, async ({ page }) => {
      await page.goto(route);
      await capture(page, name);
    });
  }
});

test.describe('Pseudo-locale — authenticated pages', () => {
  test.beforeEach(async ({ page }) => {
    // Log in with the default locale (loginAs matches English labels), then
    // switch the session to the pseudo-locale.
    await loginAs(page);
    await usePseudoLocale(page);
  });

  for (const { name, path: route } of AUTHENTICATED_PAGES) {
    test(name, async ({ page }) => {
      await page.goto(route);
      await capture(page, name);
    });
  }
});
