/**
 * Shared type definitions for visual regression tests.
 */

/** Extra metadata attached to each Playwright project. */
export interface VisualProject {
  metadata?: {
    /** 'light' | 'dark' */
    theme: 'light' | 'dark';
    /** 'desktop' | 'tablet' | 'mobile' */
    viewportLabel: 'desktop' | 'tablet' | 'mobile';
  };
}

/** Shape of a single entry in the visual metrics report. */
export interface VisualTestResult {
  test: string;
  project: string;
  status: 'passed' | 'failed' | 'skipped';
  diffPixels: number | null;
  diffRatio: number | null;
  snapshotPath: string | null;
  diffPath: string | null;
  durationMs: number;
}

/** Top-level shape of the visual metrics JSON report. */
export interface VisualMetricsReport {
  generatedAt: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  results: VisualTestResult[];
}
